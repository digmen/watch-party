# Changelog

Notable changes to this project. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).


## 2026-10-10

- Rooms are public or private (link-only), with an optional password set at creation or later by the owner (settings panel in the room). Landing shows the 10 newest public rooms, `/public` lists them all; private/password rooms are entered by link (+ password). New public endpoints `GET /api/public/rooms` and `/api/public/rooms/:id`; `PATCH /api/rooms/:id` for the owner.
- "No frame, no playback": a viewer whose buffer runs dry pauses the whole room (server-held, with a "waiting for X" banner) and the room resumes by itself once everyone has frames. Verified with an artificially stalled client.
- More sources via yt-dlp: YouTube (video+audio merged without re-encoding, up to 1080p H.264/AAC), Twitch incl. live (captured into a growing playlist), TikTok, Rutube, Dailymotion, X/Twitter, VK, ok.ru. Video titles are stored for room lists.

- A download interrupted by a restart no longer removes a video people are watching: once it has enough segments the asset stays `ready` with a closed playlist (it simply ends earlier). Verified by killing the backend and ffmpeg mid-download.

- Fix: play/pause/seek events are stamped with the server clock instead of the sender's own. With a client clock off by N seconds the whole room froze at the start for N seconds (reproduced on production, verified fixed with clocks skewed by +150 s / -90 s).

- Playback starts while the video is still downloading (HLS event playlist, "ready" after ~18 s of video) instead of after the whole file; failed-midway downloads end cleanly. Up to 3 videos are processed at once.
- Room player: own controls (play/pause, shared seek slider, time, volume, fullscreen, Space/K, arrows ±10 s, F, M). Seeking now syncs the whole room — native controls were removed because their seek bar only moved one viewer.
- hls.js requests carry credentials (needed for cross-origin API), start at 0 and recover from fatal network/media errors.
- Unsupported-link error is now in Russian and lists what is supported.

- Daily Postgres backup to Cloudflare R2 (`infra/scripts/backup.sh`, bucket `watchparty-backups`, 30-day lifecycle) and `infra/scripts/restore.sh` for moving to any host. Restore verified against a throwaway container.
- Landing and About rewritten in plain language (no engineering jargon, no ad/paid-plan promises that do not exist), FAQ with FAQPage JSON-LD.

- Guest can host: `POST /api/auth/guest/start` creates a guest and their own room in one call; the landing page now has a name-only "Смотреть сразу" form. Guest owners may add a video to their own room (owner-only, 10/hour per guest, enforced in `VideoProxyController`).
- Google sign-in made live: callback moved out of the `/api` prefix to `/auth/google/callback` (the URI registered in Google Cloud), post-login redirect goes to `/rooms`.
- 404 page and catch-all route; `/privacy` and `/terms` pages (required for the Google consent screen); footer links; absolute `Sitemap:` in robots.txt.
- Cloudflare Web Analytics beacon (cookieless).
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
- **Video cache eviction.** `VideoCacheCleanupService` (`apps/backend/src/modules/video/`) runs
  hourly, walking `lastAccessedAt` and removing anything older than `VIDEO_CACHE_TTL_HOURS` from
  disk and the database — the same Redis `NX`-lock pattern as `guest-cleanup.service.ts`, so
  replicas don't race each other. Previously parsed and never applied; the cache volume grew
  without bound.

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
- **`VITE_PUBLIC_ORIGIN` could not actually be set.** The SEO foundation above read it, but the
  frontend is built inside Docker and neither `apps/frontend/Dockerfile` nor the Caddy prod
  overlay (`infra/docker-compose.caddy.yml`) passed it through as a build arg — canonical,
  `og:url` and the sitemap silently stayed off no matter what env the host set. Fixed with
  `ARG`/`ENV VITE_PUBLIC_ORIGIN` in the build stage and `build.args` in the compose overlay, now
  that the app has a stable domain (`kerry.zone`) to set it to.
- **`og:image`/`twitter:image` were relative paths** (`/og-image.svg`) in the static `index.html`
  fallback that link-preview crawlers actually read — the Open Graph spec requires an absolute
  URL, so no preview image rendered anywhere. `sitemap.xml` had the same problem with its `<loc>`
  entries. Both are absolute now. A canonical `<link>` tag did not exist anywhere in the codebase
  before this — added via `useHead` for the client render and duplicated in static `index.html`
  for non-JS crawlers, same reasoning as the existing OG/Twitter duplication there.
- **`deploy.sh` could report a broken deploy as failed when it had actually succeeded.** The
  backend health check retries for up to a minute; the frontend check was a single one-shot
  `curl` right after `docker compose up`, which sometimes ran before nginx inside the container
  was ready to accept connections — caught live when a fully working deploy still turned CI red.
  Frontend now retries on the same schedule as backend.
- **2026-09-05 — `og:image`/`twitter:image` now point at a real PNG, not an SVG.** Telegram,
  Slack, X and Facebook don't rasterize SVG for link previews — they showed nothing. The SVG
  (`apps/frontend/public/og-image.svg`) stays as the editable source; a 1200×630 PNG rendered
  from it (`sharp`, one-off — not a runtime dependency) is what `index.html`/`seo.ts` reference
  now, plus `og:image:type`/`width`/`height` so crawlers don't have to probe the file to size it.

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
- **2026-09-05 — playback is now authorized per room, not just per asset.** `getStatus`,
  `getPlaylist` and `getSegment` used to accept any valid JWT; now each checks that the caller
  belongs to at least one room the asset is currently attached to (an asset can legitimately sit
  in more than one room, since identical source URLs dedup to the same row). Went with a plain
  membership check on every request rather than the signed short-TTL token this was sketched as
  needing (see old TODO/SECURITY.md entries) — it revokes access the instant someone leaves a
  room, and at current traffic the extra indexed query costs nothing real; revisit if segment
  volume ever makes it show up in profiling.

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
