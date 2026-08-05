import { describe, expect, test } from "bun:test";
import { VideoResolverService } from "./video-resolver.service";

describe("VideoResolverService.classifyFast", () => {
  const resolver = new VideoResolverService();

  test("classifies .m3u8 URLs as hls", async () => {
    expect(await resolver.classifyFast("https://example.com/stream/playlist.m3u8")).toBe("hls");
  });

  test("classifies .m3u8 URLs with a query string as hls", async () => {
    expect(await resolver.classifyFast("https://example.com/playlist.m3u8?token=abc")).toBe("hls");
  });

  test("classifies .mpd URLs as dash", async () => {
    expect(await resolver.classifyFast("https://example.com/manifest.mpd")).toBe("dash");
  });

  test("classifies .mp4 URLs as direct_mp4", async () => {
    expect(await resolver.classifyFast("https://example.com/video.mp4")).toBe("direct_mp4");
  });

  test("classifies .webm URLs as direct_mp4", async () => {
    expect(await resolver.classifyFast("https://example.com/video.webm")).toBe("direct_mp4");
  });

  test("falls back to needs_extraction for an arbitrary page (no recognizable extension)", async () => {
    expect(await resolver.classifyFast("https://kinogo.online/filmy/15307-tri-idiota.html")).toBe("needs_extraction");
  });

  test("falls back to needs_extraction for an extractor-host page URL too (that's resolveForFetch's job)", async () => {
    expect(await resolver.classifyFast("https://ok.ru/video/4230225725967")).toBe("needs_extraction");
  });
});

describe("VideoResolverService.isExtractorHost", () => {
  const resolver = new VideoResolverService();

  test("recognizes the allowlisted platforms", () => {
    expect(resolver.isExtractorHost("https://ok.ru/video/4230225725967")).toBe(true);
    expect(resolver.isExtractorHost("https://vkvideo.ru/video-218720520_456239059")).toBe(true);
    expect(resolver.isExtractorHost("https://vk.com/video-1_1")).toBe(true);
  });

  test("does not treat an arbitrary page as an extractor host", () => {
    expect(resolver.isExtractorHost("https://kinogo.online/filmy/15307-tri-idiota.html")).toBe(false);
  });

  test("does not throw on an unparseable URL", () => {
    expect(resolver.isExtractorHost("not a url")).toBe(false);
  });
});

describe("VideoResolverService.resolveForFetch", () => {
  const resolver = new VideoResolverService();

  test("resolves a plain direct URL without needing yt-dlp", async () => {
    expect(await resolver.resolveForFetch("https://example.com/video.mp4")).toEqual({
      kind: "direct_mp4",
      playbackUrl: "https://example.com/video.mp4",
      headers: {},
    });
  });

  test("throws (rather than hanging or crashing) for an extractor host when yt-dlp isn't available", async () => {
    // yt-dlp isn't installed outside the Docker runtime image (this test runs on the bare host).
    await expect(resolver.resolveForFetch("https://ok.ru/video/4230225725967")).rejects.toThrow();
  });

  test("throws for an arbitrary non-extractor page", async () => {
    await expect(resolver.resolveForFetch("https://kinogo.online/filmy/15307-tri-idiota.html")).rejects.toThrow();
  });
});
