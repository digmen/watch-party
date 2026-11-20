import { describe, expect, test } from "bun:test";
import { rutubeYtDlpInfo } from "./__fixtures__/ytdlp-rutube-hls";
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

describe("VideoResolverService.resolveForFetch with yt-dlp output", () => {
  // Feeds a captured `yt-dlp -J` JSON instead of spawning the binary (absent on the bare host).
  function resolverWith(json: unknown): VideoResolverService {
    const resolver = new VideoResolverService();
    const stub = resolver as unknown as {
      spawnYtDlp: () => unknown;
      classifyDirectUrl: (url: string) => Promise<string | undefined>;
    };
    stub.spawnYtDlp = () => ({
      exited: Promise.resolve(0),
      stdout: new Blob([JSON.stringify(json)]).stream(),
      stderr: new Blob([""]).stream(),
      kill: () => {},
    });
    // Extension-only classification: no HEAD request to rutube.ru from a unit test.
    stub.classifyDirectUrl = async (url) => (/\.m3u8(\?|$)/.test(url) ? "hls" : undefined);
    return resolver;
  }

  const rutube = rutubeYtDlpInfo;

  test("Rutube: an HLS asset with its renditions for the adaptive master", async () => {
    const resolved = await resolverWith(rutube).resolveForFetch(
      "https://rutube.ru/video/bd88f9f4c863aa61baa6df28f36d83a3/",
    );
    expect(resolved.kind).toBe("hls");
    expect(resolved.playbackUrl).toBe(rutube.url);
    expect(resolved.variants?.map((v) => v.height)).toEqual([1040, 696, 456, 344, 232]);
    expect(resolved.headers["User-Agent"]).toContain("Mozilla");
  });

  test("a live HLS broadcast stays on the ffmpeg path, without renditions", async () => {
    const resolved = await resolverWith({ ...rutube, is_live: true }).resolveForFetch("https://rutube.ru/live/x/");
    expect(resolved.kind).toBe("direct_mp4");
    expect(resolved.variants).toBeUndefined();
  });

  test("YouTube-style split audio+video stays on the ffmpeg path", async () => {
    const resolved = await resolverWith({
      title: "t",
      requested_formats: [
        { url: "https://v.example/video", vcodec: "avc1.640028", acodec: "none" },
        { url: "https://v.example/audio", vcodec: "none", acodec: "mp4a.40.2" },
      ],
      formats: rutube.formats,
    }).resolveForFetch("https://www.youtube.com/watch?v=x");
    expect(resolved.kind).toBe("direct_mp4");
    expect(resolved.audioUrl).toBe("https://v.example/audio");
    expect(resolved.variants).toBeUndefined();
  });
});
