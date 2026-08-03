import { describe, expect, test } from "bun:test";
import { VideoResolverService } from "./video-resolver.service";

describe("VideoResolverService.classify", () => {
  const resolver = new VideoResolverService();

  test("classifies .m3u8 URLs as hls", async () => {
    expect(await resolver.classify("https://example.com/stream/playlist.m3u8")).toBe("hls");
  });

  test("classifies .m3u8 URLs with a query string as hls", async () => {
    expect(await resolver.classify("https://example.com/playlist.m3u8?token=abc")).toBe("hls");
  });

  test("classifies .mpd URLs as dash", async () => {
    expect(await resolver.classify("https://example.com/manifest.mpd")).toBe("dash");
  });

  test("classifies .mp4 URLs as direct_mp4", async () => {
    expect(await resolver.classify("https://example.com/video.mp4")).toBe("direct_mp4");
  });

  test("classifies .webm URLs as direct_mp4", async () => {
    expect(await resolver.classify("https://example.com/video.webm")).toBe("direct_mp4");
  });
});
