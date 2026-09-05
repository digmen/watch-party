# TODO

What is not done yet, and why it was left. Grouped by whether it blocks something real, is a
known gap we chose to live with, or is simply nice to have.

Anything already shipped is in [CHANGELOG.md](CHANGELOG.md).

## Blocking / next up

These are not "someday" items — each one is something that looks finished from the outside and
is not.

Both items previously listed here are done — see [CHANGELOG.md](CHANGELOG.md) (2026-09-05).
Nothing currently blocking.

## Known gaps

Deliberate trade-offs. Documented so the reasoning survives, not because they're fine forever.
- [ ] **`trustProxy` is off**, so `@nestjs/throttler` sees one source IP behind
      `cloudflared` → Traefik and rate-limits everyone as a single caller. Guest creation works
      around this with a per-room Redis counter; nothing else does.
- [ ] **One video per room.** Last one added wins. The `room_videos` table already has a
      `queuePosition` column that nothing reads — a real queue is a small extension, just not
      built.
- [ ] **HLS support is deliberately narrow.** One-segment-per-file playlists only (what the
      built-in `ffmpeg` remux produces). No `#EXT-X-BYTERANGE`/fMP4, no multi-bitrate master
      playlists. Pointing it at one of those fails cleanly rather than mis-playing.
- [ ] **Arbitrary pages are not extracted.** Direct media URLs work, and ok.ru/VK work through
      `yt-dlp`; a general film-hosting page (`kinogo.online/...` and friends) is classified
      `needs_extraction` and reported as an error. Doing it properly means a headless browser in
      the backend image, which is a real size and maintenance cost.
- [ ] **Backend image is ~664 MB** — `ffmpeg` plus `yt-dlp` plus their Python runtime. Fine for a
      single-box deployment, worth trimming before this is ever pulled repeatedly.
- [ ] **No end-to-end tests in CI.** The guest/playback/chat flow has been verified through the
      live tunnel by hand (15 assertions, all passing) but those scripts were throwaway. CI runs
      build, lint, typecheck, unit tests and both Docker builds — no browser.

## Nice to have

- [ ] **Paid ad-free plan.** The product is free with ads between sessions; a paid plan removes
      the ads and changes nothing else — no feature gating beyond that. Needs a subscription/
      payment system, not built yet. No ads system exists yet either, so this is genuinely two
      pieces of unbuilt infrastructure, not one.
- [ ] Observability: Prometheus metrics + Grafana. Right now the only signal is container logs.
- [ ] Brotli precompression alongside gzip — needs `ngx_brotli`, absent from stock nginx.
- [ ] Prerendering the landing page for crawlers that don't execute JavaScript. Static meta and
      JSON-LD in `index.html` cover link previews; full prerender would need Node in the runtime
      image, which today is bare nginx.
