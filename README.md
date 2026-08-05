# Watch Party

Open-source synchronized watch-together app: create a room, paste a direct video link, and
watch in sync with everyone in the room — playback stays locked together even across page
reloads and multiple backend replicas. Built as a monorepo to show a real engineering pipeline
end to end (real auth, a real realtime gateway, a real video pipeline, real Docker multi-stage
builds), not a demo script.

**Live status**: the full stack — auth, rooms, realtime sync, video streaming, chat, and guest
access — is built and has been verified end to end through a real deployment (Docker Compose +
Traefik + a Cloudflare Tunnel). See [CHANGELOG.md](CHANGELOG.md) for what changed most recently,
[TODO.md](TODO.md) for what's still open, and [Roadmap](#roadmap) for the milestone view.

## Features

- **Watch together without an account.** Send someone the room link; they enter a display name and
  they're in. No email, no password — the room UUID *is* the invite. Guests can watch, chat and
  drive playback in that one room, and nothing else.
- **Auth**: email + password (Argon2id via `Bun.password`) and Google OAuth, JWT access/refresh
  tokens in httpOnly cookies, CSRF double-submit protection, refresh-token rotation with replay
  detection.
- **Rooms**: create a room, share it by link, join/leave, per-room membership and roles, live
  in-room chat.
- **Realtime sync**: a WebSocket gateway broadcasts play/pause/seek to everyone in a room, with a
  server-authoritative playback clock and client-side clock-drift correction (soft
  `playbackRate` nudges for small drift, hard seeks past ~300ms) — verified to stay within tens
  of milliseconds across two independent browser tabs, and across two independent backend
  processes sharing only Redis.
- **Video pipeline**: paste a direct `.mp4`/`.m3u8`/`.mpd` URL; the backend classifies it, then
  either remuxes it into HLS with `ffmpeg` (direct files, `-c copy` — no re-encode) or transparently
  proxies + caches HLS/DASH segments on first request. Every viewer after the first is served from
  cache, not from the origin. Swapping in a different video mid-session is a normal operation —
  everyone in the room picks it up over the websocket without reloading.
- **ok.ru and VK links** resolve through `yt-dlp`, including the request headers those CDNs
  require (without a real browser `User-Agent` they answer `400`).
- **A public front door**: a landing page and an about page explain the product to someone who has
  never seen it, with per-route meta, JSON-LD, `robots.txt` and `sitemap.xml`. Room pages are
  `noindex` — they're private and ephemeral.
- **No domain required**: a Cloudflare Quick Tunnel exposes the app on a random `*.trycloudflare.com`
  URL — no DNS, no port forwarding, no Cloudflare account.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Vue 3 (Composition API) + Vite, Pinia, `hls.js`, `socket.io-client`, `@unhead/vue` |
| Backend | NestJS on **Fastify** (not Express), Drizzle ORM, BullMQ, `ioredis` |
| Realtime | `fastify-socket.io` + a custom Nest `IoAdapter` + `@socket.io/redis-adapter` (works around a real Fastify/socket.io incompatibility — see `apps/backend/src/modules/gateway/fastify-redis-io.adapter.ts`) |
| Data | PostgreSQL 16, Redis 7 |
| Video | `ffmpeg` (remux), `yt-dlp` (ok.ru/VK resolution), a transparent HLS/DASH segment cache |
| Package manager / runtime | Bun (workspaces, no Turborepo/Nx) |
| Containers | Docker multi-stage builds, `oven/bun:1-alpine`, `nginx:1.27-alpine` |
| Edge / public access | Traefik (path-based routing) + Cloudflare Tunnel (Quick Tunnel mode) |
| Shared contracts | zod schemas in `packages/shared`, consumed by both frontend and backend |

## Monorepo layout

```
apps/backend/     NestJS + Fastify API, WebSocket gateway, video pipeline
apps/frontend/     Vue 3 + Vite SPA
packages/shared/   zod schemas shared by both — the single source of truth for the wire contract
infra/             docker-compose files, Traefik static config, helper scripts
```

## Quickstart

### Local dev

```bash
cp .env.example .env              # fill in secrets
cp apps/frontend/.env.example apps/frontend/.env
bun install
bun run dev                        # docker compose: postgres + redis only
```

Then in two more terminals:

```bash
cd apps/backend && bun run start:dev   # NestJS on :3000
cd apps/frontend && bun run dev        # Vite on :5173
```

### Full stack in Docker (with public access, no domain)

```bash
cp .env.example .env               # fill in real secrets before this — see below
bun run prod                        # builds + starts everything, including a Cloudflare Tunnel
sh infra/scripts/print-tunnel-url.sh   # prints the public https://*.trycloudflare.com URL
```

`.env` must have `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, and `CSRF_SECRET` set
to real random values (not the `change-me` placeholders) before running this against anything
public. Google OAuth is optional — the app runs fine with just email/password if
`GOOGLE_OAUTH_CLIENT_ID` is left blank.

Two knobs worth knowing about, both with sane defaults in `.env.example`:
`MAX_GUESTS_PER_ROOM` (how many people can join one room by link) and `GUEST_TTL_DAYS` (how long
an inactive guest account survives before the nightly cleanup removes it).

Canonical URLs, `og:url` and absolute sitemap entries need one stable public origin, and a Quick
Tunnel hostname is random and changes on every restart — so they are switched off unless
`VITE_PUBLIC_ORIGIN` is set at build time. Everything else (titles, descriptions, JSON-LD,
`robots.txt`) works regardless. See the first item in [TODO.md](TODO.md): the variable is read by
the app but not yet plumbed through the Docker build, so today it can only be set for a local
`vite build`.

## Architecture notes worth reading

A few decisions here aren't the "default tutorial" way of doing things, on purpose:

- **No `@nestjs/passport`.** It doesn't work reliably under `@nestjs/platform-fastify` (passport
  assumes an Express-shaped `req`/`res`). Google OAuth uses the Fastify-native `@fastify/oauth2`
  plugin directly instead.
- **No default `@nestjs/platform-socket.io` adapter.** It can't expose a reachable socket.io
  endpoint under Fastify (a known, still-open upstream issue). `fastify-socket.io` mounts
  socket.io directly on the Fastify instance, and a small custom `IoAdapter` hands that working
  server back to Nest instead of letting it try to build its own.
- **Remux, not re-encode.** Direct `.mp4` sources go through `ffmpeg -c copy` (repackaging into
  HLS), not a full decode/encode pass — cheap enough to run on a 1 vCPU box. Re-encoding to
  AV1/VP9 for extra compression is a legitimate idea but deliberately **not** automatic — see the
  comments in `video-prefetch.processor.ts`.
- **HTTP/3 is Cloudflare's job, not Traefik's.** Cloudflare's edge already negotiates HTTP/3 with
  the browser regardless of what the origin speaks, and `cloudflared` already speaks QUIC to that
  edge. Adding a separate QUIC entrypoint on Traefik for the `cloudflared → traefik` hop (loopback-
  speed, same Docker network) would add real config complexity for no measurable gain.

## Known limitations

Full list with reasoning in [TODO.md](TODO.md). The ones most likely to bite you:

- The HLS/DASH proxy handles classic one-segment-per-file playlists (what the built-in `ffmpeg`
  remux also produces). It does not yet handle fMP4/CMAF playlists that address segments by byte
  range (`#EXT-X-BYTERANGE`) inside one file, or multi-bitrate master playlists — pointing it at
  one of those will fail cleanly rather than silently mis-play.
- One "current video" per room (last one added wins) — a real queue is a small, natural extension
  of the existing `room_videos` table, just not built yet.
- Arbitrary web pages aren't supported. Direct media URLs work, and ok.ru/VK go through `yt-dlp`;
  a general film-hosting page is classified `needs_extraction` and reported as a clear error
  rather than scraped.
- **The video cache is never evicted** — `VIDEO_CACHE_TTL_HOURS` is read from the environment and
  currently enforced by nothing, so the cache volume grows until the disk does.
- **Playback is authorized per asset, not per room**: knowing an asset UUID is enough to pull that
  stream from another room. See [SECURITY.md](SECURITY.md).
- `trustProxy` is off, so the HTTP rate limiter sees every request as coming from one IP (the
  tunnel). Guest creation compensates with a per-room counter in Redis; nothing else does.

## Legal note

See [SECURITY.md](SECURITY.md) — this project proxies and caches third-party video URLs. That can
violate the source site's Terms of Service or copyright depending on the content and your
jurisdiction. This is a synchronized-playback engineering demo, not a content platform; you're
responsible for only pointing it at sources you have the right to redistribute.

## Roadmap

- [x] **M0** — monorepo scaffold, Bun workspaces, Postgres/Redis/Traefik smoke test
- [x] **M1** — auth (email+password, Google OAuth), JWT cookies, Vue login/dashboard shell
- [x] **M2** — rooms, WebSocket gateway, Redis pub/sub, presence, cross-instance sync verified
- [x] **M3** — video pipeline (ffmpeg remux + HLS/DASH cache), real playback sync in two tabs
- [x] **M4** — Docker multi-stage images, Traefik routing, public access via Cloudflare Quick Tunnel
- [x] **M5** — CI (`.github/workflows/ci.yml`), contributing docs, image hardening pass
- [x] **M6** — in-room chat, guest access by link, public landing/about pages, dark design system,
      SEO foundation, video-pipeline reliability fixes, SSRF hardening, `yt-dlp` for ok.ru/VK
- [ ] **M7** — named tunnel + real domain, video-cache eviction, signed playback tokens,
      headless-browser mode for arbitrary sites, observability (Prometheus/Grafana).
      Broken out with reasoning in [TODO.md](TODO.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
