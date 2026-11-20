import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";
import { buildMasterPlaylist, type HlsVariant, rewriteMediaPlaylist, variantName } from "./hls-variants";

interface SegmentMap {
  [token: string]: string; // token -> absolute origin URL
}

export function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

// The origin refused a segment the way an expired signed URL is refused (Rutube/VK sign their CDN
// URLs). The caller may re-resolve the source and retry once — see VideoService.fetchPassthroughSegment.
export class OriginRejectedError extends Error {
  constructor(readonly status: number) {
    super(`Failed to fetch segment: ${status}`);
  }
}

// One media playlist served for an HLS passthrough asset: the single rendition (`height: null`,
// tokens `s-NNNNN`) or one rung of the adaptive set (`v720.m3u8`, tokens `v720-NNNNN`). Stored next to
// the playlist so a refresh knows which origin playlist to re-fetch for which token prefix.
interface HlsStream {
  prefix: string;
  height: number | null;
  fingerprint: string;
}

const SINGLE_PREFIX = "s-";

// How many 6-second segments must exist before a video counts as playable (~18 s).
export const READY_AFTER_SEGMENTS = 3;

@Injectable()
export class VideoCacheService {
  private readonly logger = new Logger(VideoCacheService.name);
  private readonly basePath: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.basePath = this.config.get("VIDEO_CACHE_PATH", { infer: true });
  }

  dirFor(assetHash: string): string {
    return path.join(this.basePath, assetHash);
  }

  async ensureDir(assetHash: string): Promise<string> {
    const dir = this.dirFor(assetHash);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  playlistPath(assetHash: string): string {
    return path.join(this.dirFor(assetHash), "playlist.m3u8");
  }

  private segmentMapPath(assetHash: string): string {
    return path.join(this.dirFor(assetHash), "segments.json");
  }

  private headersPath(assetHash: string): string {
    return path.join(this.dirFor(assetHash), "origin-headers.json");
  }

  private streamsPath(assetHash: string): string {
    return path.join(this.dirFor(assetHash), "streams.json");
  }

  private async fetchPlaylistText(url: string, headers: Record<string, string>): Promise<string> {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
    return res.text();
  }

  private async readSegmentMap(assetHash: string): Promise<SegmentMap> {
    return readFile(this.segmentMapPath(assetHash), "utf-8")
      .then((raw) => JSON.parse(raw) as SegmentMap)
      .catch(() => ({}));
  }

  // HLS passthrough. With two or more renditions (Rutube) `playlist.m3u8` becomes a master playlist
  // over our own copies of each rendition's media playlist (`v1040.m3u8`, `v696.m3u8`, …) — they live
  // in the same directory, so the existing `/video/proxy/:id/:token` route serves them and their
  // segments, membership check included. Any rendition that cannot be fetched or carried is dropped;
  // fewer than two left means the single rendition yt-dlp picked, exactly like before.
  async proxyHls(
    playbackUrl: string,
    assetHash: string,
    headers: Record<string, string> = {},
    variants: HlsVariant[] = [],
  ): Promise<{ renditions: number }> {
    await this.ensureDir(assetHash);
    if (Object.keys(headers).length > 0) {
      await writeFile(this.headersPath(assetHash), JSON.stringify(headers));
    }

    if (variants.length >= 2) {
      const fetched = await Promise.all(
        variants.map(async (variant) => {
          try {
            const name = variantName(variant.height);
            const text = await this.fetchPlaylistText(variant.url, headers);
            const rewritten = rewriteMediaPlaylist(text, variant.url, `${name}-`, true);
            return rewritten ? { variant, name, rewritten } : undefined;
          } catch (err) {
            this.logger.warn(`rendition ${variant.height}p skipped for ${assetHash}: ${(err as Error).message}`);
            return undefined;
          }
        }),
      );
      const usable = fetched.filter((f) => f !== undefined);
      if (usable.length >= 2) {
        const segmentMap: SegmentMap = {};
        for (const f of usable) Object.assign(segmentMap, f.rewritten.segments);
        // Map first, then the media playlists, the master last: a player never sees a token the
        // server cannot resolve yet.
        await writeFile(this.segmentMapPath(assetHash), JSON.stringify(segmentMap));
        for (const f of usable)
          await writeFile(path.join(this.dirFor(assetHash), `${f.name}.m3u8`), f.rewritten.playlist);
        const streams: HlsStream[] = usable.map((f) => ({
          prefix: `${f.name}-`,
          height: f.variant.height,
          fingerprint: f.rewritten.fingerprint,
        }));
        await writeFile(this.streamsPath(assetHash), JSON.stringify(streams));
        await writeFile(
          this.playlistPath(assetHash),
          buildMasterPlaylist(usable.map((f) => ({ variant: f.variant, uri: `${f.name}.m3u8` }))),
        );
        return { renditions: usable.length };
      }
      this.logger.warn(`only ${usable.length} usable rendition(s) for ${assetHash}: single playlist instead`);
    }

    const text = await this.fetchPlaylistText(playbackUrl, headers);
    const rewritten = rewriteMediaPlaylist(text, playbackUrl, SINGLE_PREFIX) as NonNullable<
      ReturnType<typeof rewriteMediaPlaylist>
    >;
    await writeFile(this.segmentMapPath(assetHash), JSON.stringify(rewritten.segments));
    const streams: HlsStream[] = [{ prefix: SINGLE_PREFIX, height: null, fingerprint: rewritten.fingerprint }];
    await writeFile(this.streamsPath(assetHash), JSON.stringify(streams));
    await writeFile(this.playlistPath(assetHash), rewritten.playlist);
    return { renditions: 1 };
  }

  // After the origin starts refusing segments (signature expired), point the existing tokens at fresh
  // origin URLs from a new resolve. Playlists on disk — and so every token a player already holds —
  // stay as they are; only the token -> URL map changes, and only for a rendition whose fresh playlist
  // has the same segments (count and durations) as the one being served. Returns how many renditions
  // were refreshed; 0 for assets prepared before streams.json existed (hash tokens, nothing to map).
  async refreshHls(
    assetHash: string,
    playbackUrl: string,
    headers: Record<string, string> = {},
    variants: HlsVariant[] = [],
  ): Promise<number> {
    const streams = await readFile(this.streamsPath(assetHash), "utf-8")
      .then((raw) => JSON.parse(raw) as HlsStream[])
      .catch(() => [] as HlsStream[]);
    if (streams.length === 0) return 0;

    const updates: SegmentMap = {};
    let refreshed = 0;
    for (const stream of streams) {
      const url = stream.height === null ? playbackUrl : variants.find((v) => v.height === stream.height)?.url;
      if (!url) continue;
      try {
        const text = await this.fetchPlaylistText(url, headers);
        const rewritten = rewriteMediaPlaylist(text, url, stream.prefix, stream.height !== null);
        if (!rewritten || rewritten.fingerprint !== stream.fingerprint) {
          this.logger.warn(`refresh of ${stream.prefix} for ${assetHash}: different segments, kept old URLs`);
          continue;
        }
        Object.assign(updates, rewritten.segments);
        refreshed++;
      } catch (err) {
        this.logger.warn(`refresh of ${stream.prefix} for ${assetHash} failed: ${(err as Error).message}`);
      }
    }
    if (refreshed === 0) return 0;

    const segmentMap = { ...(await this.readSegmentMap(assetHash)), ...updates };
    await writeFile(this.segmentMapPath(assetHash), JSON.stringify(segmentMap));
    if (Object.keys(headers).length > 0) await writeFile(this.headersPath(assetHash), JSON.stringify(headers));
    return refreshed;
  }

  // HLS/DASH transparent passthrough: fetch the manifest once, rewrite every segment URI to a
  // proxy token we control, and remember the token->origin mapping. Segments themselves are
  // fetched lazily on first request (see getOrFetchSegment) rather than eagerly here — most of a
  // long VOD's segments may never be watched.
  //
  // `headers` (User-Agent etc.) matter beyond this one call: an extractor-resolved source (ok.ru/
  // vk — see video-resolver.service.ts) rejects requests missing them with a plain HTTP 400, and
  // segments live on the same CDN with the same requirement — so these get persisted to disk here
  // and re-read by getOrFetchSegment for every later, independent segment request.
  async proxyManifest(sourceUrl: string, assetHash: string, headers: Record<string, string> = {}): Promise<void> {
    await this.ensureDir(assetHash);
    const res = await fetch(sourceUrl, { headers });
    if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
    const text = await res.text();

    if (Object.keys(headers).length > 0) {
      await writeFile(this.headersPath(assetHash), JSON.stringify(headers));
    }

    const segmentMap: SegmentMap = {};
    const rewritten = text
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return line;
        const absoluteUrl = new URL(trimmed, sourceUrl).toString();
        const token = hashUrl(absoluteUrl) + path.extname(new URL(absoluteUrl).pathname);
        segmentMap[token] = absoluteUrl;
        return token;
      })
      .join("\n");

    await writeFile(this.segmentMapPath(assetHash), JSON.stringify(segmentMap));
    await writeFile(this.playlistPath(assetHash), rewritten);
  }

  // Number of segments listed so far in a playlist that ffmpeg is still writing. 0 when the file
  // does not exist yet.
  async countSegmentsInPlaylist(assetHash: string): Promise<number> {
    try {
      const text = await readFile(this.playlistPath(assetHash), "utf-8");
      return text.split("\n").filter((line) => line.startsWith("#EXTINF")).length;
    } catch {
      return 0;
    }
  }

  // Terminates an event playlist whose writer died, so players treat it as a finished (shorter)
  // video rather than a live stream waiting for more.
  async closePlaylist(assetHash: string): Promise<void> {
    try {
      const text = await readFile(this.playlistPath(assetHash), "utf-8");
      // A master playlist (adaptive HLS passthrough) lists renditions, not segments: nothing to close.
      if (text.includes("#EXT-X-STREAM-INF")) return;
      if (!text.includes("#EXT-X-ENDLIST"))
        await writeFile(this.playlistPath(assetHash), `${text.trimEnd()}\n#EXT-X-ENDLIST\n`);
    } catch {
      // No playlist at all — nothing playable to close.
    }
  }

  async readPlaylist(assetHash: string): Promise<string> {
    return readFile(this.playlistPath(assetHash), "utf-8");
  }

  async getOrFetchSegment(assetHash: string, token: string): Promise<string> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(token) || token.includes("..")) throw new Error("Invalid segment name");
    const segmentPath = path.join(this.dirFor(assetHash), token);
    const exists = await stat(segmentPath)
      .then(() => true)
      .catch(() => false);
    if (exists) return segmentPath;

    const segmentMap = await this.readSegmentMap(assetHash);
    const originUrl = segmentMap[token];
    if (!originUrl) throw new Error("Unknown segment token");

    const headers = await readFile(this.headersPath(assetHash), "utf-8")
      .then((raw) => JSON.parse(raw) as Record<string, string>)
      .catch(() => ({}));

    const res = await fetch(originUrl, { headers });
    if ([401, 403, 404, 410].includes(res.status)) throw new OriginRejectedError(res.status);
    if (!res.ok || !res.body) throw new Error(`Failed to fetch segment: ${res.status}`);

    await pipeline(Readable.fromWeb(res.body as ReadableStream), createWriteStream(segmentPath));

    this.logger.log(`cached segment ${token} for asset ${assetHash}`);
    return segmentPath;
  }

  // Best-effort: если каталог уже снесён руками/не создавался (ассет упал на "failed" до
  // первого сегмента) — это не ошибка эвикции, а норма.
  // Total size of one asset's cache directory (recursive); 0 when it does not exist.
  async dirSizeBytes(assetHash: string): Promise<number> {
    let total = 0;
    try {
      for (const name of await readdir(this.dirFor(assetHash))) {
        total += (await stat(path.join(this.dirFor(assetHash), name)).catch(() => null))?.size ?? 0;
      }
    } catch {
      return 0;
    }
    return total;
  }

  async evictDir(assetHash: string): Promise<void> {
    await rm(this.dirFor(assetHash), { recursive: true, force: true });
  }
}
