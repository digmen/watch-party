import { createHash } from "node:crypto";
import path from "node:path";

// Adaptive quality for HLS sources that offer several muxed H.264/AAC renditions (Rutube does:
// 136p…1040p, one `m3u8_native` format per rendition and per CDN host). The backend serves its own
// master playlist over the chosen renditions so hls.js can step down on a slow connection instead
// of stalling the whole room. Everything here is pure (no I/O) so it can be unit-tested against
// yt-dlp's JSON shape.

export interface HlsVariant {
  url: string;
  height: number;
  width?: number;
  // Bits per second, as the master playlist's BANDWIDTH wants it.
  bandwidth: number;
  // `avc1.640029,mp4a.40.2` — only when yt-dlp knows both, otherwise left out (hls.js copes).
  codecs?: string;
  fps?: number;
}

// The subset of a yt-dlp `formats[]` entry used here.
export interface YtDlpFormat {
  url?: string;
  protocol?: string;
  height?: number | null;
  width?: number | null;
  tbr?: number | null;
  vcodec?: string | null;
  acodec?: string | null;
  fps?: number | null;
}

// The 144p tier is not worth a rung; Rutube's 424x232 still counts as 240p, hence 200 and not 240.
const MIN_HEIGHT = 200;
// Same ceiling as FORMAT_SELECTOR (≤1080p), with room for 1088-tall encodes.
const MAX_HEIGHT = 1088;
const MAX_VARIANTS = 5;

// Copyable into MPEG-TS and playable everywhere: H.264 video + AAC audio in the same stream. A codec
// yt-dlp could not name (master playlist without CODECS) is accepted — FORMAT_SELECTOR's last
// fallback plays exactly such formats today — but a known different codec, or a video-only/audio-only
// rendition (YouTube's split streams), is not.
function isMuxedH264Aac(f: YtDlpFormat): boolean {
  const v = f.vcodec ?? undefined;
  const a = f.acodec ?? undefined;
  if (v === "none" || a === "none") return false;
  if (v !== undefined && !/^(avc[13]|h264)/i.test(v)) return false;
  if (a !== undefined && !/^(mp4a|aac)/i.test(a)) return false;
  return true;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

// One rendition per height, from the formats yt-dlp listed. Rutube lists every rendition twice (two
// CDN hosts); the copy on the same host as the format yt-dlp picked wins, so all rungs share one CDN.
// Returns [] when there is nothing to adapt between (fewer than two usable heights) — the caller then
// keeps the plain single-playlist path.
export function pickAbrVariants(formats: YtDlpFormat[] | undefined, chosenUrl: string): HlsVariant[] {
  if (!formats?.length) return [];
  const chosenHost = hostOf(chosenUrl);

  const byHeight = new Map<number, YtDlpFormat & { url: string; height: number }>();
  for (const f of formats) {
    if (!f.url || !f.protocol?.startsWith("m3u8")) continue;
    if (typeof f.height !== "number" || f.height < MIN_HEIGHT || f.height > MAX_HEIGHT) continue;
    if (!isMuxedH264Aac(f)) continue;
    const candidate = f as YtDlpFormat & { url: string; height: number };
    const current = byHeight.get(f.height);
    if (!current || better(candidate, current, chosenHost)) byHeight.set(f.height, candidate);
  }
  if (byHeight.size < 2) return [];

  let picked = [...byHeight.values()].sort((a, b) => b.height - a.height);
  // Too many rungs: keep the best ones and always the lowest — the one a slow connection needs.
  if (picked.length > MAX_VARIANTS) picked = [...picked.slice(0, MAX_VARIANTS - 1), picked[picked.length - 1]];

  return picked.map((f) => ({
    url: f.url,
    height: f.height,
    ...(f.width ? { width: f.width } : {}),
    bandwidth: f.tbr ? Math.round(f.tbr * 1000) : estimateBandwidth(f.height),
    ...(f.vcodec && f.acodec ? { codecs: `${f.vcodec},${f.acodec}` } : {}),
    ...(f.fps ? { fps: f.fps } : {}),
  }));
}

function better(a: YtDlpFormat & { url: string }, b: YtDlpFormat & { url: string }, chosenHost?: string): boolean {
  const aSame = hostOf(a.url) === chosenHost;
  const bSame = hostOf(b.url) === chosenHost;
  if (aSame !== bSame) return aSame;
  return (a.tbr ?? 0) > (b.tbr ?? 0);
}

// Rough H.264 rate when the source does not say (≈2.7 Mbit/s at 1080p, ≈0.4 at 360p).
function estimateBandwidth(height: number): number {
  return Math.round(height * height * 2.3);
}

// File name of a rendition's media playlist inside the asset's cache dir, and the prefix of its
// segment tokens. Height-based, so a re-resolve (fresh signed URLs) maps onto the same names.
export function variantName(height: number): string {
  return `v${height}`;
}

export interface MasterEntry {
  variant: HlsVariant;
  uri: string;
}

// The order matters only for players that start on the first listed rendition (Safari's native
// HLS): that one is the rendition nearest to 720p from below, then the rest best-first. hls.js sorts
// by bandwidth itself and picks its start level from its own bandwidth estimate.
export function buildMasterPlaylist(entries: MasterEntry[]): string {
  const sorted = [...entries].sort((a, b) => b.variant.height - a.variant.height);
  const startIdx = sorted.findIndex((e) => e.variant.height <= 720);
  if (startIdx > 0) sorted.unshift(...sorted.splice(startIdx, 1));

  const lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-INDEPENDENT-SEGMENTS"];
  for (const { variant, uri } of sorted) {
    const attrs = [`BANDWIDTH=${variant.bandwidth}`];
    if (variant.width) attrs.push(`RESOLUTION=${variant.width}x${variant.height}`);
    if (variant.codecs) attrs.push(`CODECS="${variant.codecs}"`);
    if (variant.fps) attrs.push(`FRAME-RATE=${variant.fps.toFixed(3)}`);
    lines.push(`#EXT-X-STREAM-INF:${attrs.join(",")}`, uri);
  }
  return `${lines.join("\n")}\n`;
}

export interface RewrittenPlaylist {
  playlist: string;
  // token -> absolute origin URL
  segments: Record<string, string>;
  // Same segment count and durations => same encode; a refresh only trusts new URLs when this matches.
  fingerprint: string;
}

// Rewrites a media playlist's segment URIs to tokens served by our own segment route. Tokens are the
// segment's position (`v720-00012.ts`), not a hash of its URL: Rutube/VK sign the URL path or query,
// so after the signature expires a re-resolve yields different URLs for the very same segments — a
// position-based token lets the server swap the origin URL behind a token the player already holds.
//
// `strict` (used for ABR renditions) refuses what this plain proxy cannot carry: a master playlist,
// encryption keys, init sections and byte ranges — the caller then falls back to the single-playlist
// path. Without it lines are rewritten blindly, as the original passthrough always did.
export function rewriteMediaPlaylist(
  text: string,
  baseUrl: string,
  prefix: string,
  strict = false,
): RewrittenPlaylist | undefined {
  if (strict) {
    if (!/^\s*#EXTM3U/.test(text)) return undefined;
    if (/#EXT-X-STREAM-INF|#EXT-X-MAP|#EXT-X-BYTERANGE/.test(text)) return undefined;
    if (/#EXT-X-KEY:(?![^\n]*METHOD=NONE)/.test(text)) return undefined;
  }

  const segments: Record<string, string> = {};
  const durations: string[] = [];
  let index = 0;
  const playlist = text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#EXTINF:")) durations.push(trimmed.slice(8).split(",")[0]);
      if (!trimmed || trimmed.startsWith("#")) return line;
      const absoluteUrl = new URL(trimmed, baseUrl).toString();
      const ext = path.extname(new URL(absoluteUrl).pathname);
      const token = `${prefix}${String(index++).padStart(5, "0")}${/^\.[A-Za-z0-9]{1,8}$/.test(ext) ? ext : ""}`;
      segments[token] = absoluteUrl;
      return token;
    })
    .join("\n");

  if (strict && index === 0) return undefined;
  const fingerprint = createHash("sha256")
    .update(`${index}|${durations.join(",")}`)
    .digest("hex")
    .slice(0, 16);
  return { playlist, segments, fingerprint };
}
