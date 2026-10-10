import { Injectable, Logger } from "@nestjs/common";
import type { VideoAsset } from "../../database/schema";

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
}

interface ExtractorResult {
  url: string;
  audioUrl?: string;
  headers: Record<string, string>;
  isLive: boolean;
  title?: string;
  protocol?: string;
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

// H.264 + AAC only: those two copy straight into MPEG-TS segments (no transcoding, so no CPU cost
// and no quality loss). VP9/AV1 + Opus — what YouTube serves for its best qualities — would need
// re-encoding. Up to 1080p; falls back to whatever single file the site offers.
const FORMAT_SELECTOR =
  "bv*[height<=1080][vcodec^=avc1]+ba[acodec^=mp4a]/b[height<=1080][vcodec^=avc1]/b[height<=1080]/b";

// ok.ru observed taking 40-90s in practice (its extractor does more than a single HTTP round
// trip) — 20s was cutting it off mid-resolution. This runs inside an async BullMQ job / the
// "add video" request, not blocking the WS gateway, so a generous ceiling is cheap.
const YT_DLP_TIMEOUT_MS = 90_000;

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
        return { ...base, kind: resolvedKind, playbackUrl: resolved.url };
      }
    }

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

  private spawnYtDlp(sourceUrl: string) {
    try {
      // -J (dump-single-json) instead of -g: a bare resolved URL isn't enough to actually fetch
      // it — ok.ru/vk's CDN 400s a request without a real browser User-Agent — so this needs
      // yt-dlp's "http_headers" alongside the URL, not just the URL.
      return Bun.spawn(["yt-dlp", "-f", FORMAT_SELECTOR, "--no-playlist", "-J", "--no-warnings", sourceUrl], {
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

  private async runYtDlp(sourceUrl: string): Promise<ExtractorResult | undefined> {
    const proc = this.spawnYtDlp(sourceUrl);
    if (!proc) return undefined;

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
      return undefined;
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
      };
      const base = { title: info.title, isLive: info.is_live === true };

      const parts = info.requested_formats;
      if (parts && parts.length >= 2) {
        const video = parts.find((f) => f.vcodec && f.vcodec !== "none");
        const audio = parts.find((f) => f.acodec && f.acodec !== "none" && f !== video);
        if (video && audio) {
          return {
            ...base,
            url: video.url,
            audioUrl: audio.url,
            headers: video.http_headers ?? info.http_headers ?? {},
          };
        }
      }

      if (!info.url) return undefined;
      return { ...base, url: info.url, headers: info.http_headers ?? {}, protocol: info.protocol };
    } catch (err) {
      this.logger.warn(`yt-dlp returned unparseable JSON for ${sourceUrl}: ${(err as Error).message}`);
      return undefined;
    }
  }
}
