import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";

interface SegmentMap {
  [token: string]: string; // token -> absolute origin URL
}

export function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

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

  async readPlaylist(assetHash: string): Promise<string> {
    return readFile(this.playlistPath(assetHash), "utf-8");
  }

  async getOrFetchSegment(assetHash: string, token: string): Promise<string> {
    const segmentPath = path.join(this.dirFor(assetHash), token);
    const exists = await stat(segmentPath)
      .then(() => true)
      .catch(() => false);
    if (exists) return segmentPath;

    const mapRaw = await readFile(this.segmentMapPath(assetHash), "utf-8");
    const segmentMap = JSON.parse(mapRaw) as SegmentMap;
    const originUrl = segmentMap[token];
    if (!originUrl) throw new Error("Unknown segment token");

    const headers = await readFile(this.headersPath(assetHash), "utf-8")
      .then((raw) => JSON.parse(raw) as Record<string, string>)
      .catch(() => ({}));

    const res = await fetch(originUrl, { headers });
    if (!res.ok || !res.body) throw new Error(`Failed to fetch segment: ${res.status}`);

    await pipeline(Readable.fromWeb(res.body as ReadableStream), createWriteStream(segmentPath));

    this.logger.log(`cached segment ${token} for asset ${assetHash}`);
    return segmentPath;
  }
}
