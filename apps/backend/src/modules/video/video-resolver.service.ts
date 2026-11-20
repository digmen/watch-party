import { Injectable, Logger } from "@nestjs/common";
import type { VideoAsset } from "../../database/schema";
import { type HlsVariant, pickAbrVariants, type YtDlpFormat } from "./hls-variants";

export type VideoKind = VideoAsset["kind"];
// What classifyDirectUrl/resolveForFetch can actually determine — "needs_extraction" is a
// resolver-level default for "none of the above", never a positive classification result.
type ResolvedKind = Exclude<VideoKind, "needs_extraction">;

export interface ResolvedPlayback {
  kind: ResolvedKind;
  playbackUrl: string;
  // Non-empty only for an extractor-resolved URL (ok.ru/vk): their CDN rejects requests missing a
  // real browser User-Agent (confirmed empirically — a bare fetch/curl gets HTTP 400) with exactly
  // the headers yt-dlp itself would have sent. Every later fetch of this URL — classification here,
  // the manifest/segment fetches in video-cache.service.ts, ffmpeg's `-i` for a direct remux — has
  // to carry these same headers, not just the initial resolution call.
  headers: Record<string, string>;
  // A separate audio stream when the platform serves video and sound apart (YouTube above 360p).
  // ffmpeg reads both and muxes them without re-encoding.
  audioUrl?: string;
  // A live broadcast has no end: it is captured into a growing playlist until the source stops.
  isLive?: boolean;
  title?: string;
  // Two or more muxed H.264/AAC renditions of an HLS source (Rutube): the backend then serves its own
  // master playlist over them (adaptive quality). Only set when `kind` is "hls"; `playbackUrl` is
  // still the single rendition yt-dlp picked, used when the multi-rendition setup fails.
  variants?: HlsVariant[];
}

interface ExtractorResult {
  url: string;
  audioUrl?: string;
  headers: Record<string, string>;
  isLive: boolean;
  title?: string;
  protocol?: string;
  variants?: HlsVariant[];
}

const EXTENSION_MAP: Array<[RegExp, ResolvedKind]> = [
  [/\.m3u8(\?|$)/i, "hls"],
  [/\.mpd(\?|$)/i, "dash"],
  [/\.(mp4|webm|mov|m4v)(\?|$)/i, "direct_mp4"],
];

// Page URLs on these hosts aren't playable directly — the real stream sits behind a player that
// yt-dlp knows how to resolve. Deliberately a small, explicit allowlist rather than falling back
// to yt-dlp's generic/"any site with a <video> tag" extractor: this is a resolver for a handful of
// named platforms, not a general page-scraper (see NEEDS_EXTRACTION_MESSAGE in video.service.ts —
// arbitrary-page extraction is an explicit non-goal of this MVP).
const EXTRACTOR_DOMAINS = [
  "ok.ru",
  "vk.com",
  "vkvideo.ru",
  "youtube.com",
  "youtu.be",
  "twitch.tv",
  "tiktok.com",
  "rutube.ru",
  "dailymotion.com",
  "dai.ly",
  "x.com",
  "twitter.com",
];

// Hosts whose metadata API is geo-restricted to Russia; see regionProxyFor().
const RU_PROXY_DOMAINS = ["rutube.ru"];

// H.264 + AAC only: those two copy straight into MPEG-TS segments (no transcoding, so no CPU cost
// and no quality loss). VP9/AV1 + Opus — what YouTube serves for its best qualities — would need
// re-encoding. Up to 1080p; falls back to whatever single file the site offers.
const FORMAT_SELECTOR =
  "bv*[height<=1080][vcodec^=avc1]+ba[acodec^=mp4a]/b[height<=1080][vcodec^=avc1]/b[height<=1080]/b";

// ok.ru observed taking 40-90s in practice (its extractor does more than a single HTTP round
// trip) — 20s was cutting it off mid-resolution. This runs inside an async BullMQ job / the
// "add video" request, not blocking the WS gateway, so a generous ceiling is cheap.
const YT_DLP_TIMEOUT_MS = 90_000;
// Rutube fails in bursts of several seconds (measured 20.11: 502 on 3 of 4 lookups during a burst);
// six attempts with growing pauses span ~30s, enough to outlast one.
const YT_DLP_ATTEMPTS = 6;
// Server-side hiccups and network blips — worth another try. Anything else (404, private,
// unsupported) is a real answer.
const TRANSIENT_YT_DLP_ERROR =
  /HTTP Error 5\d\d|timed out|Connection (reset|refused|aborted)|Temporary failure|EOF occurred/i;

@Injectable()
export class VideoResolverService {
  private readonly logger = new Logger(VideoResolverService.name);

  // Extension-first classification, falling back to a HEAD request's Content-Type when the URL
  // itself is ambiguous (no recognizable extension). Deliberately does NOT invoke yt-dlp — this
  // runs synchronously in the "add video" HTTP request path (video.service.ts), and yt-dlp can
  // take 40-90s for a site like ok.ru (see YT_DLP_TIMEOUT_MS), which is not something to block an
  // HTTP response on. See resolveForFetch() for the slow path, used only inside the BullMQ job.
  async classifyFast(sourceUrl: string): Promise<VideoKind> {
    return (await this.classifyDirectUrl(sourceUrl)) ?? "needs_extraction";
  }

  // The browser-based fallback (services/sniffer) is optional: configured per deployment.
  canSniff(sourceUrl: string): boolean {
    if (!process.env.SNIFFER_URL) return false;
    try {
      return /^https?:$/.test(new URL(sourceUrl).protocol);
    } catch {
      return false;
    }
  }

  // Opens the page in a real browser, presses play and reports the media request it makes.
  private async sniffPage(pageUrl: string): Promise<ResolvedPlayback | undefined> {
    const base = process.env.SNIFFER_URL;
    if (!base) return undefined;
    try {
      const res = await fetch(`${base}/sniff`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: pageUrl }),
        signal: AbortSignal.timeout(70_000),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        title?: string | null;
        media?: { url: string; kind: "hls" | "dash" | "mp4"; headers: Record<string, string> };
      };
      this.logger.log(
        `sniffer for ${pageUrl}: ${body.ok ? `${body.media?.kind} ${body.media?.url.slice(0, 90)}` : body.error}`,
      );
      if (!body.ok || !body.media) return undefined;
      // Every sniffed stream goes through ffmpeg: it understands master playlists, encrypted and
      // fMP4 HLS and DASH, which the plain playlist proxy deliberately does not.
      return {
        kind: "direct_mp4",
        playbackUrl: body.media.url,
        headers: body.media.headers,
        title: body.title ?? undefined,
      };
    } catch (err) {
      this.logger.warn(`sniffer failed for ${pageUrl}: ${(err as Error).message}`);
      return undefined;
    }
  }

  isExtractorHost(sourceUrl: string): boolean {
    try {
      const host = new URL(sourceUrl).hostname.toLowerCase();
      return EXTRACTOR_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
      return false;
    }
  }

  // The slow path: only ever called from inside the BullMQ job (video-prefetch.processor.ts),
  // never from a request handler. Re-resolves through yt-dlp rather than reusing whatever
  // `classifyFast()` saw when the video was added — ok.ru/vk stream URLs carry short-lived
  // tokens, so the one resolved at "add video" time may already be stale by the time this job
  // actually runs.
  async resolveForFetch(sourceUrl: string): Promise<ResolvedPlayback> {
    const directKind = await this.classifyDirectUrl(sourceUrl);
    if (directKind) return { kind: directKind, playbackUrl: sourceUrl, headers: {} };

    if (this.isExtractorHost(sourceUrl)) {
      const resolved = await this.runYtDlp(sourceUrl);
      if (resolved) {
        const base = { headers: resolved.headers, title: resolved.title };
        // Two streams, or a live broadcast: both go through the ffmpeg remux path.
        if (resolved.audioUrl || resolved.isLive) {
          return {
            ...base,
            kind: "direct_mp4",
            playbackUrl: resolved.url,
            audioUrl: resolved.audioUrl,
            isLive: resolved.isLive,
          };
        }
        const resolvedKind =
          (await this.classifyDirectUrl(resolved.url, resolved.headers)) ??
          (resolved.protocol?.startsWith("m3u8") ? "hls" : "direct_mp4");
        const variants = resolvedKind === "hls" && resolved.variants?.length ? resolved.variants : undefined;
        return { ...base, kind: resolvedKind, playbackUrl: resolved.url, ...(variants ? { variants } : {}) };
      }
    }

    // A browser on these pages plays the platform's pre-roll ads first and, when the film is
    // region-locked, an "unavailable" stub — the sniffer would capture exactly that. Better to
    // report a clear failure than to show the room an advert.
    if (this.isAdInjectingHost(sourceUrl)) {
      throw new Error(`Could not resolve a playable stream for ${sourceUrl}`);
    }

    // Not a file, not a known platform: let a real browser look at the page.
    const sniffed = await this.sniffPage(sourceUrl);
    if (sniffed) return sniffed;

    throw new Error(`Could not resolve a playable stream for ${sourceUrl}`);
  }

  private async classifyDirectUrl(url: string, headers?: Record<string, string>): Promise<ResolvedKind | undefined> {
    for (const [pattern, kind] of EXTENSION_MAP) {
      if (pattern.test(url)) return kind;
    }

    try {
      const res = await fetch(url, { method: "HEAD", headers });
      // Case-insensitive: ok.ru's CDN sends "application/x-mpegURL" (capital URL), which a
      // literal lowercase ".includes('mpegurl')" check would silently miss.
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (contentType.includes("mpegurl")) return "hls";
      if (contentType.includes("dash+xml")) return "dash";
      if (contentType.startsWith("video/")) return "direct_mp4";
    } catch {
      // network errors here just fall through to the caller's "needs_extraction" default — the
      // prefetch step will surface the real error when it actually tries to fetch the source.
    }

    return undefined;
  }

  // Some platforms answer "unavailable in your region / VPN" to a server outside Russia (Rutube
  // does, for licensed films: its play-options API refuses, the CDN itself does not). Only the
  // metadata lookup goes through RU_PROXY_URL (a SOCKS tunnel to a Russian host) — the returned
  // stream URLs are fetched directly, so video traffic never crosses the proxy. Without the
  // variable nothing changes. Without this, yt-dlp fails and the sniffer fallback ends up
  // capturing Rutube's pre-roll ads and the "unavailable" stub instead of the film.
  private regionProxyFor(sourceUrl: string): string | undefined {
    const proxy = process.env.RU_PROXY_URL;
    if (!proxy) return undefined;
    try {
      const host = new URL(sourceUrl).hostname.toLowerCase();
      return RU_PROXY_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`)) ? proxy : undefined;
    } catch {
      return undefined;
    }
  }

  private isAdInjectingHost(sourceUrl: string): boolean {
    try {
      const host = new URL(sourceUrl).hostname.toLowerCase();
      return RU_PROXY_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
      return false;
    }
  }

  private spawnYtDlp(sourceUrl: string) {
    try {
      // -J (dump-single-json) instead of -g: a bare resolved URL isn't enough to actually fetch
      // it — ok.ru/vk's CDN 400s a request without a real browser User-Agent — so this needs
      // yt-dlp's "http_headers" alongside the URL, not just the URL.
      const args = ["yt-dlp", "-f", FORMAT_SELECTOR, "--no-playlist", "-J", "--no-warnings"];
      const proxy = this.regionProxyFor(sourceUrl);
      if (proxy) args.push("--proxy", proxy);
      args.push(sourceUrl);
      return Bun.spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (err) {
      // Missing outside the Docker runtime image (local `bun run dev`, CI, unit tests) — degrade
      // to "needs_extraction" instead of crashing the request.
      this.logger.warn(`yt-dlp is not available: ${(err as Error).message}`);
      return undefined;
    }
  }

  // Platforms' APIs fail now and then for a second (Rutube answers 502 to roughly one lookup in a
  // few, in bursts) — a retry is what a person pressing "play" again would do. Only transient failures are
  // retried: a private/removed video fails the same way every time and would just triple the wait.
  private async runYtDlp(sourceUrl: string): Promise<ExtractorResult | undefined> {
    for (let attempt = 1; ; attempt++) {
      const { result, transient } = await this.runYtDlpOnce(sourceUrl);
      if (result || !transient || attempt >= YT_DLP_ATTEMPTS) return result;
      this.logger.log(`yt-dlp retry ${attempt + 1}/${YT_DLP_ATTEMPTS} for ${sourceUrl}`);
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
    }
  }

  private async runYtDlpOnce(sourceUrl: string): Promise<{ result?: ExtractorResult; transient: boolean }> {
    const proc = this.spawnYtDlp(sourceUrl);
    if (!proc) return { transient: false };

    const timeout = setTimeout(() => proc.kill(), YT_DLP_TIMEOUT_MS);
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    clearTimeout(timeout);

    this.logger.log(`yt-dlp for ${sourceUrl}: exit=${exitCode} stdoutLen=${stdout.length}`);

    if (exitCode !== 0) {
      this.logger.warn(`yt-dlp failed for ${sourceUrl} (exit ${exitCode}): ${stderr.split("\n").slice(-5).join(" ")}`);
      return { transient: TRANSIENT_YT_DLP_ERROR.test(stderr) };
    }

    try {
      const info = JSON.parse(stdout) as {
        url?: string;
        title?: string;
        protocol?: string;
        is_live?: boolean;
        http_headers?: Record<string, string>;
        requested_formats?: Array<{
          url: string;
          vcodec?: string;
          acodec?: string;
          http_headers?: Record<string, string>;
        }>;
        formats?: YtDlpFormat[];
      };
      const base = { title: info.title, isLive: info.is_live === true };

      const parts = info.requested_formats;
      if (parts && parts.length >= 2) {
        const video = parts.find((f) => f.vcodec && f.vcodec !== "none");
        const audio = parts.find((f) => f.acodec && f.acodec !== "none" && f !== video);
        if (video && audio) {
          return {
            transient: false,
            result: {
              ...base,
              url: video.url,
              audioUrl: audio.url,
              headers: video.http_headers ?? info.http_headers ?? {},
            },
          };
        }
      }

      if (!info.url) return { transient: false };
      // A live broadcast goes through ffmpeg; only a VOD HLS source gets the multi-rendition master.
      const variants = !base.isLive && info.protocol?.startsWith("m3u8") ? pickAbrVariants(info.formats, info.url) : [];
      return {
        transient: false,
        result: {
          ...base,
          url: info.url,
          headers: info.http_headers ?? {},
          protocol: info.protocol,
          ...(variants.length >= 2 ? { variants } : {}),
        },
      };
    } catch (err) {
      this.logger.warn(`yt-dlp returned unparseable JSON for ${sourceUrl}: ${(err as Error).message}`);
      return { transient: false };
    }
  }
}
