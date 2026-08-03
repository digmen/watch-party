# Security & responsible use

## Third-party video sources

This project's core feature is a server-side proxy/prefetch pipeline that fetches a video
stream from a source URL, caches/repackages it (HLS remux or transparent segment cache), and
re-serves it to everyone in a room. **This is an engineering demo of synchronized playback, not
a content platform.** Fetching and re-serving a third-party video stream can violate that
source's Terms of Service or copyright depending on the content and the jurisdiction you're in.
Operators running this software are responsible for only pointing it at sources they have the
right to fetch and redistribute.

## Reporting a vulnerability

Open an issue or, for anything sensitive, contact the maintainer directly (see repo profile).
