import { z } from "zod";

// The backend fetches whatever URL this schema lets through — a HEAD during classification, then
// ffmpeg/yt-dlp against it inside the container. So this is not merely input tidiness: it is the
// boundary that stops a user from pointing the server at its own private network. Reject anything
// that isn't plain http(s) to a public host, before any request is made.
//
// Deliberately a string check and not a DNS lookup: resolving here would still be racy (the name
// can resolve differently by the time ffmpeg connects) and would itself be a lookup on attacker
// input. This blocks the literal-address cases, which is what a URL field realistically carries.
const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);

// Container-internal service names from infra/docker-compose.yml — reachable from the backend and
// meaningless to a real viewer.
const BLOCKED_SERVICE_NAMES = new Set(["postgres", "redis", "backend", "frontend", "traefik", "cloudflared"]);

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((p) => Number(p));
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return false;

  const [a, b] = octets;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata at 169.254.169.254
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SERVICE_NAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "::") return true;
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true; // IPv6 link-local / ULA
  if (isPrivateIpv4(host)) return true;
  return false;
}

export const AddVideoSchema = z.object({
  sourceUrl: z
    .string()
    .url()
    .refine((raw) => {
      const protocol = (() => {
        try {
          return new URL(raw).protocol;
        } catch {
          return null;
        }
      })();
      return protocol === "http:" || protocol === "https:";
    }, "Поддерживаются только ссылки http:// и https://")
    .refine((raw) => {
      try {
        return !isPrivateHost(new URL(raw).hostname);
      } catch {
        return false;
      }
    }, "Ссылка ведёт во внутреннюю сеть — так нельзя"),
});
export type AddVideoDto = z.infer<typeof AddVideoSchema>;

export const VideoAssetSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["direct_mp4", "hls", "dash", "needs_extraction"]),
  status: z.enum(["pending", "processing", "ready", "failed"]),
  playbackUrl: z.string().nullable(),
  failureReason: z.string().nullable(),
});
export type VideoAssetDto = z.infer<typeof VideoAssetSchema>;
