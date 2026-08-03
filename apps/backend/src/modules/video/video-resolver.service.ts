import { Injectable } from "@nestjs/common";
import type { VideoAsset } from "../../database/schema";

export type VideoKind = VideoAsset["kind"];

const EXTENSION_MAP: Array<[RegExp, VideoKind]> = [
  [/\.m3u8(\?|$)/i, "hls"],
  [/\.mpd(\?|$)/i, "dash"],
  [/\.(mp4|webm|mov|m4v)(\?|$)/i, "direct_mp4"],
];

@Injectable()
export class VideoResolverService {
  // Extension-first classification, falling back to a HEAD request's Content-Type when the URL
  // itself is ambiguous (no recognizable extension) — covers URLs that proxy through a query
  // string or a redirect without a literal file extension.
  async classify(sourceUrl: string): Promise<VideoKind> {
    for (const [pattern, kind] of EXTENSION_MAP) {
      if (pattern.test(sourceUrl)) return kind;
    }

    try {
      const res = await fetch(sourceUrl, { method: "HEAD" });
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("mpegurl")) return "hls";
      if (contentType.includes("dash+xml")) return "dash";
      if (contentType.startsWith("video/")) return "direct_mp4";
    } catch {
      // network errors here just fall through to "needs_extraction" below — the prefetch step
      // will surface the real error when it actually tries to fetch the source.
    }

    return "needs_extraction";
  }
}
