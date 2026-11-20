import { describe, expect, test } from "bun:test";
import type { VideoAsset } from "../../database/schema";
import { VideoService } from "./video.service";
import { OriginRejectedError } from "./video-cache.service";

// Only the segment-refresh path is exercised here; the other collaborators are never touched.
function serviceWith(cache: object, resolver: object): VideoService {
  const unused = {} as never;
  return new VideoService(unused, resolver as never, cache as never, unused, unused, unused);
}

const asset = { id: "a1", sourceUrl: "https://rutube.ru/video/x/", sourceUrlHash: "h1" } as VideoAsset;

describe("VideoService.fetchPassthroughSegment", () => {
  test("an expired segment re-resolves once and retries with the refreshed URL", async () => {
    let calls = 0;
    let resolves = 0;
    const cache = {
      getOrFetchSegment: async () => {
        calls++;
        if (calls === 1) throw new OriginRejectedError(403);
        return "/cache/h1/v696-00010.ts";
      },
      refreshHls: async (_hash: string, _url: string, _headers: object, variants: unknown[]) => variants.length,
    };
    const resolver = {
      resolveForFetch: async () => {
        resolves++;
        return { kind: "hls", playbackUrl: "u", headers: {}, variants: [{}, {}] };
      },
    };
    const service = serviceWith(cache, resolver);
    expect(await service.fetchPassthroughSegment(asset, "v696-00010.ts")).toBe("/cache/h1/v696-00010.ts");
    expect(resolves).toBe(1);
    expect(calls).toBe(2);
  });

  test("concurrent refusals share one re-resolve, and a second wave inside the cooldown does not re-run yt-dlp", async () => {
    let resolves = 0;
    const cache = {
      getOrFetchSegment: async () => {
        throw new OriginRejectedError(403);
      },
      refreshHls: async () => 0,
    };
    const resolver = {
      resolveForFetch: async () => {
        resolves++;
        await new Promise((r) => setTimeout(r, 10));
        return { kind: "hls", playbackUrl: "u", headers: {} };
      },
    };
    const service = serviceWith(cache, resolver);
    const results = await Promise.allSettled([
      service.fetchPassthroughSegment({ ...asset, id: "a2" }, "s-00001.ts"),
      service.fetchPassthroughSegment({ ...asset, id: "a2" }, "s-00002.ts"),
    ]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    await expect(service.fetchPassthroughSegment({ ...asset, id: "a2" }, "s-00003.ts")).rejects.toBeInstanceOf(
      OriginRejectedError,
    );
    expect(resolves).toBe(1);
  });

  test("other failures are not retried", async () => {
    let resolves = 0;
    const cache = {
      getOrFetchSegment: async () => {
        throw new Error("Failed to fetch segment: 502");
      },
    };
    const service = serviceWith(cache, { resolveForFetch: async () => resolves++ });
    await expect(service.fetchPassthroughSegment(asset, "s-00001.ts")).rejects.toThrow("502");
    expect(resolves).toBe(0);
  });
});
