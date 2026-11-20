import { describe, expect, test } from "bun:test";
import { rutubeYtDlpInfo } from "./__fixtures__/ytdlp-rutube-hls";
import { buildMasterPlaylist, pickAbrVariants, rewriteMediaPlaylist, type YtDlpFormat } from "./hls-variants";

const rutube = rutubeYtDlpInfo as { url: string; formats: YtDlpFormat[] };

describe("pickAbrVariants", () => {
  test("Rutube: one rendition per height, same CDN host as the chosen format, 144p tier dropped", () => {
    const variants = pickAbrVariants(rutube.formats, rutube.url);
    expect(variants.map((v) => v.height)).toEqual([1040, 696, 456, 344, 232]);
    for (const v of variants) expect(new URL(v.url).hostname).toBe("river-1.rutube.ru");
    expect(variants[0]).toEqual({
      url: rutube.url,
      height: 1040,
      width: 1920,
      bandwidth: 3_168_000,
      codecs: "avc1.640029,mp4a.40.2",
      fps: 23.976,
    });
  });

  test("falls back to the highest bitrate copy when the chosen host does not offer a height", () => {
    const formats: YtDlpFormat[] = [
      { url: "https://a.cdn/720.m3u8", protocol: "m3u8_native", height: 720, tbr: 2000 },
      { url: "https://b.cdn/480.m3u8", protocol: "m3u8_native", height: 480, tbr: 900 },
      { url: "https://c.cdn/480.m3u8", protocol: "m3u8_native", height: 480, tbr: 1100 },
    ];
    expect(pickAbrVariants(formats, "https://a.cdn/720.m3u8").map((v) => v.url)).toEqual([
      "https://a.cdn/720.m3u8",
      "https://c.cdn/480.m3u8",
    ]);
  });

  test("ignores split streams, other codecs, non-HLS formats and anything above 1080p", () => {
    const formats: YtDlpFormat[] = [
      { url: "https://x/v.m3u8", protocol: "m3u8_native", height: 720, vcodec: "avc1.4d401f", acodec: "none" },
      { url: "https://x/a.m3u8", protocol: "m3u8_native", height: 480, vcodec: "vp09.00.40.08", acodec: "opus" },
      { url: "https://x/f.mp4", protocol: "https", height: 360, vcodec: "avc1.42c01e", acodec: "mp4a.40.2" },
      { url: "https://x/4k.m3u8", protocol: "m3u8_native", height: 2160, vcodec: "avc1.640033", acodec: "mp4a.40.2" },
      { url: "https://x/360.m3u8", protocol: "m3u8_native", height: 360, vcodec: "avc1.42c01e", acodec: "mp4a.40.2" },
    ];
    // Only one usable height left: nothing to adapt between.
    expect(pickAbrVariants(formats, "https://x/360.m3u8")).toEqual([]);
  });

  test("accepts renditions whose codecs yt-dlp could not name, and estimates their bandwidth", () => {
    const formats: YtDlpFormat[] = [
      { url: "https://x/720.m3u8", protocol: "m3u8", height: 720 },
      { url: "https://x/360.m3u8", protocol: "m3u8", height: 360 },
    ];
    const variants = pickAbrVariants(formats, "https://x/720.m3u8");
    expect(variants.map((v) => v.height)).toEqual([720, 360]);
    expect(variants[0].codecs).toBeUndefined();
    expect(variants[0].bandwidth).toBeGreaterThan(variants[1].bandwidth);
  });

  test("returns nothing for a source without formats", () => {
    expect(pickAbrVariants(undefined, "https://x/a.m3u8")).toEqual([]);
  });
});

describe("buildMasterPlaylist", () => {
  test("Rutube master: the ≤720p rung first (Safari starts there), then best-first", () => {
    const variants = pickAbrVariants(rutube.formats, rutube.url);
    const master = buildMasterPlaylist(variants.map((variant) => ({ variant, uri: `v${variant.height}.m3u8` })));
    expect(master).toBe(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        '#EXT-X-STREAM-INF:BANDWIDTH=1774000,RESOLUTION=1280x696,CODECS="avc1.640029,mp4a.40.2",FRAME-RATE=23.976',
        "v696.m3u8",
        '#EXT-X-STREAM-INF:BANDWIDTH=3168000,RESOLUTION=1920x1040,CODECS="avc1.640029,mp4a.40.2",FRAME-RATE=23.976',
        "v1040.m3u8",
        '#EXT-X-STREAM-INF:BANDWIDTH=1140000,RESOLUTION=848x456,CODECS="avc1.4d401f,mp4a.40.2",FRAME-RATE=23.976',
        "v456.m3u8",
        '#EXT-X-STREAM-INF:BANDWIDTH=1127000,RESOLUTION=640x344,CODECS="avc1.42c01f,mp4a.40.2",FRAME-RATE=23.976',
        "v344.m3u8",
        '#EXT-X-STREAM-INF:BANDWIDTH=690000,RESOLUTION=424x232,CODECS="avc1.42c01f,mp4a.40.2",FRAME-RATE=23.976',
        "v232.m3u8",
        "",
      ].join("\n"),
    );
  });
});

// A Rutube rendition playlist as the CDN serves it (segment names relative to the signed path).
const RUTUBE_MEDIA = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:1
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-INDEPENDENT-SEGMENTS
#EXTINF:2.002,
rendition696.mp4/segment-1-v1-a1.ts
#EXTINF:4.004,
rendition696.mp4/segment-2-v1-a1.ts
#EXTINF:3.086,
rendition696.mp4/segment-3-v1-a1.ts
#EXT-X-ENDLIST
`;

describe("rewriteMediaPlaylist", () => {
  const base = "https://river-1.rutube.ru/hls-vod/SIG/1795800020/0/0x0/rendition696.mp4.m3u8?i=1280x696_1774";

  test("tokens are positions, not URL hashes, and resolve against the rendition URL", () => {
    const out = rewriteMediaPlaylist(RUTUBE_MEDIA, base, "v696-", true);
    expect(out?.playlist).toContain("v696-00000.ts\n#EXTINF:4.004,\nv696-00001.ts");
    expect(out?.segments["v696-00002.ts"]).toBe(
      "https://river-1.rutube.ru/hls-vod/SIG/1795800020/0/0x0/rendition696.mp4/segment-3-v1-a1.ts",
    );
    expect(out?.playlist).toContain("#EXT-X-ENDLIST");
  });

  test("a re-signed playlist keeps the same tokens and fingerprint, with new origin URLs", () => {
    const before = rewriteMediaPlaylist(RUTUBE_MEDIA, base, "v696-", true);
    const after = rewriteMediaPlaylist(RUTUBE_MEDIA, base.replace("/SIG/", "/NEWSIG/"), "v696-", true);
    expect(after?.fingerprint).toBe(before?.fingerprint as string);
    expect(Object.keys(after?.segments ?? {})).toEqual(Object.keys(before?.segments ?? {}));
    expect(after?.segments["v696-00000.ts"]).toContain("/NEWSIG/");
  });

  test("a different encode (other durations) gets a different fingerprint", () => {
    const a = rewriteMediaPlaylist(RUTUBE_MEDIA, base, "v696-", true);
    const b = rewriteMediaPlaylist(RUTUBE_MEDIA.replace("3.086", "3.087"), base, "v696-", true);
    expect(a?.fingerprint).not.toBe(b?.fingerprint as string);
  });

  test("strict mode refuses what the plain proxy cannot carry", () => {
    const keyed = RUTUBE_MEDIA.replace("#EXT-X-INDEPENDENT-SEGMENTS", '#EXT-X-KEY:METHOD=AES-128,URI="k.key"');
    expect(rewriteMediaPlaylist(keyed, base, "v-", true)).toBeUndefined();
    const fmp4 = RUTUBE_MEDIA.replace("#EXT-X-INDEPENDENT-SEGMENTS", '#EXT-X-MAP:URI="init.mp4"');
    expect(rewriteMediaPlaylist(fmp4, base, "v-", true)).toBeUndefined();
    expect(rewriteMediaPlaylist("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\na.m3u8\n", base, "v-", true)).toBeUndefined();
    expect(rewriteMediaPlaylist("<html>blocked</html>", base, "v-", true)).toBeUndefined();
    const unencrypted = RUTUBE_MEDIA.replace("#EXT-X-INDEPENDENT-SEGMENTS", "#EXT-X-KEY:METHOD=NONE");
    expect(rewriteMediaPlaylist(unencrypted, base, "v-", true)).toBeDefined();
  });

  test("odd segment extensions are dropped from the token instead of reaching the file name", () => {
    const out = rewriteMediaPlaylist("#EXTM3U\n#EXTINF:6,\nseg.php%3Fx\n", "https://x.example/p/a.m3u8", "s-");
    expect(Object.keys(out?.segments ?? {})).toEqual(["s-00000"]);
  });
});
