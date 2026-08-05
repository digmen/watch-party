# Changelog

Notable changes to this project. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

The release that turned a working demo into something two people can actually use together. Before
this, watching with a friend required that friend to register, a video that finished processing
could never be replaced, and a container restart could strand a video in `processing` forever.

### Added

- **Guest access by room link.** A visitor opens a room URL, types a display name, and watches —
  no email, no password (`POST /api/auth/guest`, `apps/backend/src/modules/guest/`). The room UUID
  *is* the invite. Guests are real `users` rows (anything else breaks the foreign keys on
  `room_members` and `room_messages`), marked with `is_guest` / `guest_room_id` and scoped to the
  one room they were invited to. Migration `0004_sleepy_puck.sql` makes `users.email` nullable —
  safe because Postgres `UNIQUE` is `NULLS DISTINCT` by default, so any number of guests coexist
  without collisions.
- **Public landing and about pages.** `/` is now a real page explaining the product to someone who
  has never seen it; the room list moved to `/rooms`. Previously the first thing a visitor met was
  a login form with no explanation of what they were logging into.
- **Replace the video in a room.** The add-video form stays reachable after an asset is ready, so
  a room can move on to the next thing without being recreated.
- **`video:changed` realtime event.** Everyone in the room gets the new video without reloading.
  This also fixes a dead end: someone who joined *before* a video was added used to sit on a blank
  screen indefinitely, because nothing ever told their client to start polling.
- **Share the room.** A visible copy-link control in the room — the URL used to be something you
  had to select out of the address bar by hand.
- **In-room chat persistence and delivery** verified across three concurrent sessions.
- **ok.ru / VK video support** via `yt-dlp`. The resolver now runs `yt-dlp -J` and threads the
  returned `http_headers` all the way through to `ffmpeg -headers` and to later segment fetches —
  without a real browser `User-Agent` those CDNs answer `400`.
- **Dark cinema design system** (`apps/frontend/src/styles/tokens.css`, `base.css`) — colour,
  spacing, type and focus scales, plus `prefers-reduced-motion`. There was no global CSS at all
  before this; every control was a browser default.
- **SEO foundation** — `@unhead/vue` per-route title/description/OG, static meta and JSON-LD in
  `index.html` (link-preview crawlers do not execute JavaScript, so client-side tags are invisible
  to them), `robots.txt`, `sitemap.xml`, and `noindex` on room pages.
- **Security headers in nginx** — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `server_tokens off`. Helmet only ever covered the backend; the HTML is
  served by a separate container that had none of this.
- **SSRF regression tests** — 10 attack vectors plus a positive control in
  `packages/shared/src/schemas/schemas.test.ts`.

### Fixed

- **Videos could stick in `processing` forever.** The worker wrote `processing` with no `finally`
  and no failure listener, so a container restart mid-remux left a row nothing would ever finish.
  Now: every exit path writes a terminal status, `@OnWorkerEvent("failed")` marks the asset,
  `ffmpeg` has a 30-minute timeout (only `yt-dlp` had one), and a startup reconciliation pass
  releases anything left `pending`/`processing` without a live job.
- **Retrying a stuck video did nothing.** The retry gate only accepted `failed`, and BullMQ
  silently no-ops `queue.add` when the `jobId` already exists — so re-submitting the same URL
  looked accepted and did nothing. The gate now also accepts stranded assets, and the stale job is
  removed before re-adding.
- **Refresh tokens and logout were both broken.** The `refresh_token` cookie was scoped to `/auth`
  while the endpoints live under `/api/auth` — cookie path matching is a prefix test, so the
  cookie never arrived. Sessions could not refresh, and logout could not revoke, leaving 30-day
  zombie sessions. Fixed to `path: "/api/auth"`.
- **Two 401s in the console on every page load.** Both auth cookies are `httpOnly`, so the client
  could not tell "logged out" from "never logged in" and guessed by trying. A non-sensitive
  `has_session` hint cookie is now set alongside them, which removes the guess rather than hiding
  its symptom.
- **Joining a room did nothing for anyone but its creator.** There was no auto-join, so a second
  visitor was never a member; the websocket join returned an error, `playback` stayed undefined,
  and the 200ms sync tick crash-looped.
- **Guests dropped out of sync partway through a film.** The socket authenticates from a
  15-minute access token at handshake, and a room that is simply playing makes no HTTP requests
  for hours — so any reconnect past that mark was rejected forever. `connect_error` now refreshes
  the session once (latched, so retries cannot rotate the refresh token against itself) and
  reconnects.
- **ok.ru streams were misclassified** — the content-type check was case-sensitive and ok.ru sends
  `application/x-mpegURL`.

### Security

- **Membership is now checked on the video endpoints.** `addVideo` and `getLatestForRoom` accepted
  any authenticated caller who knew a room UUID.
- **SSRF barrier on `AddVideoSchema`.** It used to be a bare `z.string().url()`, and the backend
  would `fetch` whatever it was given from *inside* the Docker network — `http://redis:6379`,
  `http://postgres:5432`, `file:///etc/passwd`, cloud metadata at `169.254.169.254`. The schema
  now allows only `http:`/`https:` and rejects loopback, private, link-local and
  container-service-name hosts before any request is made. Mandatory registration used to be the
  only thing standing in front of this; guest access removes that barrier, so this had to land
  first.
- **`FullAccountGuard`** keeps guests out of room creation and room enumeration; `rooms.join`
  additionally verifies a guest is entering their own room.
- **Guest-ness lives on the database row, not just in the token.** `rotateRefreshToken` re-signs
  claims from the user row every 15 minutes, so a flag set only at the guest endpoint would have
  silently promoted every guest to a full account after one refresh.
- **Guest creation is rate-limited per room** in Redis, independently of the IP throttler — behind
  `cloudflared` → Traefik every request shares one source IP, so per-IP limiting cannot
  distinguish callers at all.

### Changed

- Backend image base `oven/bun:1-slim` → `oven/bun:1-alpine`, with `ffmpeg` and `yt-dlp` from
  `apk` instead of `apt-get`.
- Frontend build now gzip-precompresses `.txt`, `.xml` and `.webmanifest` as well, so `robots.txt`
  and `sitemap.xml` are not served uncompressed.
- Stale guest accounts are reaped daily — but only those with no live session **and** no chat
  messages: `room_messages.user_id` is `ON DELETE CASCADE`, so deleting a guest who spoke would
  erase their lines from the room's history.

## Previously

- **Add in-room chat (M6)** — live and persisted chat inside the room.
- **Watch Party: synchronized video watch rooms** — M0–M5: monorepo, auth, rooms, realtime sync,
  video pipeline, Docker images, Traefik routing, Cloudflare Quick Tunnel.
