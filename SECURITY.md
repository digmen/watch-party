# Security & responsible use

## Third-party video sources

This project's core feature is a server-side proxy/prefetch pipeline that fetches a video
stream from a source URL, caches/repackages it (HLS remux or transparent segment cache), and
re-serves it to everyone in a room. **This is an engineering demo of synchronized playback, not
a content platform.** Fetching and re-serving a third-party video stream can violate that
source's Terms of Service or copyright depending on the content and the jurisdiction you're in.
Operators running this software are responsible for only pointing it at sources they have the
right to fetch and redistribute.

## Threat model

### A room link is a bearer credential

There is no invite list and no per-person approval: whoever holds a room URL can enter it, and
guests need only a display name. The room UUID *is* the password. That is a deliberate product
decision — the whole point is sending a friend one link — but it has consequences that the code
takes seriously:

- Room pages are `noindex, nofollow`, and `<meta name="referrer" content="no-referrer">` is set
  globally so following any outbound link from a room does not hand the room URL to a third party
  in the `Referer` header.
- Guest creation is capped per room (`MAX_GUESTS_PER_ROOM`) and rate-limited per room via a Redis
  counter. The per-IP HTTP throttler cannot help here: behind `cloudflared` → Traefik every
  request arrives from the same source address, so IP-based limiting cannot distinguish callers.
- Guests cannot take a display name already present in the room, so nobody can impersonate the
  host in chat.
- Guests are scoped to the single room they were invited to. They cannot create rooms, cannot
  enumerate rooms, and cannot join a different one (`FullAccountGuard`, plus an explicit check in
  `rooms.join`). Guest-ness is stored on the user row, not only in the token, because refresh
  re-signs claims from that row.

Treat a room link the way you would treat a password: don't post it publicly, and create a new
room when you want to revoke access.

### Server-side request forgery

The backend fetches a URL that a user supplied, from inside the Docker network — the same network
where `postgres` and `redis` are reachable by service name. URL validation is therefore a security
boundary, not a convenience check. `AddVideoSchema` in `packages/shared` allows only `http:` and
`https:` and rejects loopback, private, link-local (including cloud metadata at `169.254.169.254`)
and container-service-name hosts before any request is made; the attack vectors are covered by
tests in `packages/shared/src/schemas/schemas.test.ts`. Adding a video also requires membership in
the room.

### Fixed 2026-09-05: playback is now authorized per room, not just per asset

Was: cached streams are addressed by asset UUID, and any authenticated user who knew one could
fetch it regardless of which room they were in. Fixed by checking room membership on every asset-
status, playlist, and segment request (`VideoProxyController.assertAssetAccessible` — a video can
legitimately sit in more than one room, since identical source URLs dedup to the same asset row,
so the check is "member of *any* room that has this asset attached", not "member of one owning
room").

This was sketched above as needing a signed short-TTL token instead, to avoid a DB round trip per
segment. Went with the plain membership check instead: it revokes access the instant someone
leaves a room (a token keeps working until it expires), and at current traffic (~0 concurrent
viewers, see the 2026-09-05 usage audit) the extra indexed query per segment costs nothing real.
Revisit with a signed-token/short-cache layer if segment request volume ever makes that query show
up in profiling — not before.

### Guest accounts

Guests are real rows in `users` (anything else would break the foreign keys on `room_members` and
`room_messages`). A nightly job removes stale ones, but only those with no live refresh token and
no chat messages — `room_messages.user_id` cascades on delete, so removing a guest who spoke would
erase their lines from the room's history.

## Reporting a vulnerability

Open an issue or, for anything sensitive, contact the maintainer directly (see repo profile).
