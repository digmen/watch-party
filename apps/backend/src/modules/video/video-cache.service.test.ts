import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.schema";
import type { HlsVariant } from "./hls-variants";
import { OriginRejectedError, VideoCacheService } from "./video-cache.service";

// A fake Rutube-like CDN on localhost: rendition playlists live under a signed path (`/<sig>/…`),
// segments next to them, and only the currently valid signature is accepted.
let validSig = "sig1";
let brokenRendition = "";
const requests: string[] = [];
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(req) {
    const url = new URL(req.url);
    requests.push(url.pathname);
    const [, sig, file] = url.pathname.split("/");
    if (sig !== validSig) return new Response("expired", { status: 403 });
    const rendition = /^r(\d+)\.m3u8$/.exec(file ?? "");
    if (rendition) {
      if (rendition[1] === brokenRendition) return new Response("nope", { status: 500 });
      const h = rendition[1];
      return new Response(
        `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:4.004,\nr${h}/seg-1.ts\n#EXTINF:2.002,\nr${h}/seg-2.ts\n#EXT-X-ENDLIST\n`,
      );
    }
    return new Response(`segment ${url.pathname}`);
  },
});
const origin = `http://127.0.0.1:${server.port}`;

const variantsFor = (sig: string): HlsVariant[] => [
  { url: `${origin}/${sig}/r1040.m3u8`, height: 1040, width: 1920, bandwidth: 3_168_000 },
  { url: `${origin}/${sig}/r696.m3u8`, height: 696, width: 1280, bandwidth: 1_774_000 },
  { url: `${origin}/${sig}/r344.m3u8`, height: 344, width: 640, bandwidth: 1_127_000 },
];

let base: string;
let cache: VideoCacheService;

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "wp-cache-test-"));
  cache = new VideoCacheService({ get: () => base } as unknown as ConfigService<Env, true>);
});

afterAll(async () => {
  server.stop(true);
  await rm(base, { recursive: true, force: true });
});

describe("VideoCacheService.proxyHls", () => {
  test("several renditions: master playlist + one media playlist per rendition, all served from the cache dir", async () => {
    validSig = "sig1";
    const { renditions } = await cache.proxyHls(`${origin}/sig1/r1040.m3u8`, "abr", {}, variantsFor("sig1"));
    expect(renditions).toBe(3);

    const master = await cache.readPlaylist("abr");
    expect(master).toContain("#EXT-X-STREAM-INF:BANDWIDTH=1774000,RESOLUTION=1280x696\nv696.m3u8");
    expect(master).toContain("v1040.m3u8");
    expect(master).toContain("v344.m3u8");

    // The rendition playlist is what the segment route hands out for `v696.m3u8`.
    const media = await readFile(await cache.getOrFetchSegment("abr", "v696.m3u8"), "utf-8");
    expect(media).toContain("v696-00000.ts");
    expect(media).toContain("#EXT-X-ENDLIST");

    const seg = await readFile(await cache.getOrFetchSegment("abr", "v344-00001.ts"), "utf-8");
    expect(seg).toBe("segment /sig1/r344/seg-2.ts");
  });

  test("a master playlist is never 'closed' with ENDLIST", async () => {
    await cache.closePlaylist("abr");
    expect(await cache.readPlaylist("abr")).not.toContain("#EXT-X-ENDLIST");
  });

  test("an expired signature surfaces as OriginRejectedError, and a refresh re-points the same tokens", async () => {
    validSig = "sig2"; // the old signature now gets 403
    await expect(cache.getOrFetchSegment("abr", "v1040-00000.ts")).rejects.toBeInstanceOf(OriginRejectedError);

    const refreshed = await cache.refreshHls("abr", `${origin}/sig2/r1040.m3u8`, {}, variantsFor("sig2"));
    expect(refreshed).toBe(3);
    const seg = await readFile(await cache.getOrFetchSegment("abr", "v1040-00000.ts"), "utf-8");
    expect(seg).toBe("segment /sig2/r1040/seg-1.ts");
    // Playlists the players already hold are untouched.
    expect(await readFile(path.join(base, "abr", "v1040.m3u8"), "utf-8")).toContain("v1040-00000.ts");
  });

  test("a rendition that cannot be fetched is dropped; one left means the plain single playlist", async () => {
    validSig = "sig3";
    brokenRendition = "696";
    const two = await cache.proxyHls(`${origin}/sig3/r1040.m3u8`, "partial", {}, variantsFor("sig3"));
    expect(two.renditions).toBe(2);
    expect(await cache.readPlaylist("partial")).not.toContain("v696.m3u8");

    const only = await cache.proxyHls(`${origin}/sig3/r1040.m3u8`, "single", {}, variantsFor("sig3").slice(0, 2));
    expect(only.renditions).toBe(1);
    const single = await cache.readPlaylist("single");
    expect(single).not.toContain("#EXT-X-STREAM-INF");
    expect(single).toContain("s-00000.ts");
    brokenRendition = "";
  });

  test("without variants (VK, ok.ru, a pasted .m3u8) it is the single playlist, refreshable too", async () => {
    validSig = "sig4";
    expect((await cache.proxyHls(`${origin}/sig4/r720.m3u8`, "plain")).renditions).toBe(1);
    validSig = "sig5";
    expect(await cache.refreshHls("plain", `${origin}/sig5/r720.m3u8`)).toBe(1);
    expect(await readFile(await cache.getOrFetchSegment("plain", "s-00001.ts"), "utf-8")).toBe(
      "segment /sig5/r720/seg-2.ts",
    );
  });

  test("a refresh that finds a different playlist keeps the old URLs", async () => {
    validSig = "sig6";
    await cache.proxyHls(`${origin}/sig6/r720.m3u8`, "mismatch");
    // The URL now answers with something that is not the same list of segments.
    expect(await cache.refreshHls("mismatch", `${origin}/sig6/other.m3u8`)).toBe(0);
    expect(await readFile(await cache.getOrFetchSegment("mismatch", "s-00000.ts"), "utf-8")).toBe(
      "segment /sig6/r720/seg-1.ts",
    );
  });
});
