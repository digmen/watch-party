# Watch Party

Open-source synchronized watch-together app: create a room, paste a direct video link, and
watch in sync with everyone in the room — playback stays locked together even across page
reloads and multiple backend replicas. Built as a monorepo to show a real engineering pipeline
end to end (real auth, a real realtime gateway, a real video pipeline, real Docker multi-stage
builds), not a demo script.

**Live status**: the full stack — auth, rooms, realtime sync, and video streaming — is built and
has been verified end to end through a real deployment (Docker Compose + Traefik + a Cloudflare
Tunnel). See [Roadmap](#roadmap) for what's done and what's next.

## Features

- **Auth**: email + password (Argon2id via `Bun.password`) and Google OAuth, JWT access/refresh
  tokens in httpOnly cookies, CSRF double-submit protection, refresh-token rotation with replay
  detection.
- **Rooms**: create a room, invite others by ID, join/leave, per-room membership and roles.
- **Realtime sync**: a WebSocket gateway broadcasts play/pause/seek to everyone in a room, with a
  server-authoritative playback clock and client-side clock-drift correction (soft
  `playbackRate` nudges for small drift, hard seeks past ~300ms) — verified to stay within tens
  of milliseconds across two independent browser tabs, and across two independent backend
  processes sharing only Redis.
- **Video pipeline**: paste a direct `.mp4`/`.m3u8`/`.mpd` URL; the backend classifies it, then
  either remuxes it into HLS with `ffmpeg` (direct files, `-c copy` — no re-encode) or transparently
  proxies + caches HLS/DASH segments on first request. Every viewer after the first is served from
  cache, not from the origin.
- **No domain required**: a Cloudflare Quick Tunnel exposes the app on a random `*.trycloudflare.com`
  URL — no DNS, no port forwarding, no Cloudflare account.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Vue 3 (Composition API) + Vite, Pinia, `hls.js`, `socket.io-client` |
| Backend | NestJS on **Fastify** (not Express), Drizzle ORM, BullMQ, `ioredis` |
| Realtime | `fastify-socket.io` + a custom Nest `IoAdapter` + `@socket.io/redis-adapter` (works around a real Fastify/socket.io incompatibility — see `apps/backend/src/modules/gateway/fastify-redis-io.adapter.ts`) |
| Data | PostgreSQL 16, Redis 7 |
| Video | `ffmpeg` (remux), a transparent HLS/DASH segment cache |
| Package manager / runtime | Bun (workspaces, no Turborepo/Nx) |
| Containers | Docker multi-stage builds, `oven/bun:1-slim`, `nginx:1.27-alpine` |
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

- The HLS/DASH proxy handles classic one-segment-per-file playlists (what the built-in `ffmpeg`
  remux also produces). It does not yet handle fMP4/CMAF playlists that address segments by byte
  range (`#EXT-X-BYTERANGE`) inside one file, or multi-bitrate master playlists — pointing it at
  one of those will fail cleanly rather than silently mis-play.
- One "current video" per room (last one added wins) — a real queue is a small, natural extension
  of the existing `room_videos` table, just not built yet.
- Arbitrary web pages (not direct media URLs) aren't supported — the resolver classifies those as
  `needs_extraction` and reports a clear error rather than attempting to scrape them.

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
- [ ] **M5** — CI, contributing docs, image hardening pass *(in progress — this is what you're reading)*
- [ ] **M6** (stretch) — named tunnel + real domain, in-room chat, headless-browser mode for
      arbitrary sites, observability (Prometheus/Grafana)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
