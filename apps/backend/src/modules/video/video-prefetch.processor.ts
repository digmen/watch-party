import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { roomVideos, videoAssets } from "../../database/schema";
import { RoomGateway } from "../gateway/room.gateway";
import { toVideoAssetDto } from "./video.presenter";
import { READY_AFTER_SEGMENTS, VideoCacheService } from "./video-cache.service";
import { type ResolvedPlayback, VideoResolverService } from "./video-resolver.service";

export interface PrefetchJobData {
  assetId: string;
  assetHash: string;
  sourceUrl: string;
  kind: "direct_mp4" | "hls" | "dash";
}

// Generous, but finite. A remux is bounded by download speed, not CPU (`-c copy`), so a big file
// on a slow origin legitimately takes many minutes — but "no timeout at all" means one stalled
// TCP read holds the single concurrency slot forever and every later video queues behind it.
const REMUX_TIMEOUT_MS = 2 * 60 * 60_000;
// A live broadcast is captured for as long as it runs, capped so a forgotten room cannot fill the disk.
const LIVE_CAPTURE_TIMEOUT_MS = 6 * 60 * 60_000;

// Three at once: a long film keeps its slot for the whole download (playback starts early, the job
// does not end early), and with a single slot one big video would block everyone else's.
//
// Remux (`-c copy`), never re-encode: this just repackages the container into HLS segments
// without touching the video/audio streams, so it costs a fraction of a second of CPU per second
// of video instead of a full decode+encode pass — see the deploy-target note in the plan about
// why re-encoding (AV1/VP9) is deliberately NOT what happens here on a 1 vCPU box.
@Processor("video-prefetch", { concurrency: 3 })
export class VideoPrefetchProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoPrefetchProcessor.name);

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly cache: VideoCacheService,
    private readonly resolver: VideoResolverService,
    private readonly gateway: RoomGateway,
  ) {
    super();
  }

  // Push the asset's final state to every room showing it. Without this, "Готовим видео…" stays
  // on screen until someone reloads — the client has no other way to learn the job finished, and
  // a failure would look identical to still-working.
  private async announce(assetId: string): Promise<void> {
    const [asset] = await this.db.select().from(videoAssets).where(eq(videoAssets.id, assetId)).limit(1);
    if (!asset) return;

    const rooms = await this.db
      .selectDistinct({ roomId: roomVideos.roomId })
      .from(roomVideos)
      .where(eq(roomVideos.videoAssetId, assetId));

    const dto = toVideoAssetDto(asset);
    for (const { roomId } of rooms) this.gateway.broadcastVideoChanged(roomId, dto);
  }

  // BullMQ removes a job once it finishes, so these listeners are the only chance to record a
  // failure the `process()` body never got to handle itself: an uncaught throw, or — the case
  // that actually bit us — the worker dying mid-remux on redeploy, which leaves the job "stalled"
  // and the asset row pinned at `processing` with nobody left alive to correct it.
  @OnWorkerEvent("failed")
  async onFailed(job: Job<PrefetchJobData> | undefined, err: Error) {
    if (!job?.data?.assetId) return;
    this.logger.error(`job for asset ${job.data.assetId} failed: ${err.message}`);

    // A download cut short by a redeploy or crash must not take away a video people are already
    // watching: if enough segments exist to play, keep them and close the playlist, so the video
    // simply ends earlier than the original instead of vanishing from the room mid-film.
    const segments = await this.cache.countSegmentsInPlaylist(job.data.assetHash);
    if (segments >= READY_AFTER_SEGMENTS) {
      await this.cache.closePlaylist(job.data.assetHash);
      await this.markReady(job.data.assetId, this.cache.dirFor(job.data.assetHash));
      this.logger.warn(`asset ${job.data.assetId} kept with ${segments} segments after interrupted download`);
      return;
    }
    await this.markFailed(job.data.assetId, err.message);
  }

  // Informational only: BullMQ re-queues a stalled job by itself, and if it keeps stalling past
  // maxStalledCount it ends up in "failed" — which the listener above already handles.
  @OnWorkerEvent("stalled")
  onStalled(jobId: string) {
    this.logger.warn(`job ${jobId} stalled — worker likely died mid-processing; BullMQ will requeue`);
  }

  private async markFailed(assetId: string, reason: string): Promise<void> {
    await this.db
      .update(videoAssets)
      .set({ status: "failed", failureReason: reason.slice(0, 2000) })
      .where(eq(videoAssets.id, assetId));
    await this.announce(assetId);
  }

  private async markReady(assetId: string, storagePath: string): Promise<void> {
    await this.db.update(videoAssets).set({ status: "ready", storagePath }).where(eq(videoAssets.id, assetId));
    await this.announce(assetId);
  }

  async process(job: Job<PrefetchJobData>): Promise<void> {
    const { assetId, assetHash, sourceUrl } = job.data;
    await this.db.update(videoAssets).set({ status: "processing" }).where(eq(videoAssets.id, assetId));

    // Re-resolved here rather than trusting `job.data.kind`, which for an extractor-allowlist host
    // (ok.ru, vk.com/vkvideo.ru) is only ever a provisional guess made by the fast, synchronous
    // classifier in video.service.ts — the real kind and a fresh playable URL both come from
    // yt-dlp, which takes too long (40-90s) to run in that HTTP request path. Stream tokens from
    // those sites are also short-lived, so this has to be fresh at fetch time, not add-video time.
    let kind: PrefetchJobData["kind"];
    let playbackUrl: string;
    let headers: Record<string, string>;
    let resolved: ResolvedPlayback;
    try {
      resolved = await this.resolver.resolveForFetch(sourceUrl);
      ({ kind, playbackUrl, headers } = resolved);
    } catch (err) {
      this.logger.error(`could not resolve a playable stream for asset ${assetId}: ${(err as Error).message}`);
      await this.db
        .update(videoAssets)
        .set({
          status: "failed",
          failureReason:
            "Не получилось найти видео по этой ссылке. Если это страница сайта — откройте само видео и скопируйте ссылку на файл или трансляцию.",
        })
        .where(eq(videoAssets.id, assetId));
      await this.announce(assetId);
      return;
    }
    await this.db
      .update(videoAssets)
      .set({ kind, ...(resolved.title ? { title: resolved.title.slice(0, 200) } : {}) })
      .where(eq(videoAssets.id, assetId));

    if (kind === "hls" || kind === "dash") {
      await this.prepareManifestPassthrough(assetId, assetHash, playbackUrl, headers);
      return;
    }

    await this.remuxDirectMp4(
      assetId,
      assetHash,
      playbackUrl,
      headers,
      resolved.audioUrl,
      resolved.isLive === true,
      sourceUrl,
    );
  }

  private async prepareManifestPassthrough(
    assetId: string,
    assetHash: string,
    sourceUrl: string,
    headers: Record<string, string>,
  ): Promise<void> {
    try {
      await this.cache.proxyManifest(sourceUrl, assetHash, headers);
      await this.markReady(assetId, this.cache.dirFor(assetHash));
      this.logger.log(`asset ${assetId} manifest proxied and ready`);
    } catch (err) {
      this.logger.error(`manifest proxy failed for asset ${assetId}: ${(err as Error).message}`);
      await this.markFailed(assetId, (err as Error).message);
    }
  }

  private async remuxDirectMp4(
    assetId: string,
    assetHash: string,
    sourceUrl: string,
    headers: Record<string, string>,
    audioUrl?: string,
    isLive = false,
    pageUrl?: string,
  ): Promise<void> {
    this.logger.log(`remuxing asset ${assetId} (${sourceUrl})`);
    const cacheDir = await this.cache.ensureDir(assetHash);

    // ffmpeg's own default User-Agent ("Lavf/<version>") gets the same HTTP 400 from ok.ru/vk's
    // CDN that a bare fetch does — `-headers` has to precede `-i` (it's an input option) and needs
    // a trailing CRLF per header, per ffmpeg's own `-headers` documentation.
    const headerArgs =
      Object.keys(headers).length > 0
        ? [
            "-headers",
            `${Object.entries(headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\r\n")}\r\n`,
          ]
        : [];

    // Reconnect flags: sources like googlevideo/CDNs drop long connections; without them one reset
    // ends a two-hour download at minute 40.
    // HLS playlists from arbitrary sites often name segments with odd extensions; the demuxer refuses
    // them unless told otherwise. The option only exists for HLS input, so it is added per URL.
    const input = (url: string) => [
      ...(/\.m3u8(\?|#|$)/i.test(url) ? ["-allowed_extensions", "ALL"] : []),
      ...headerArgs,
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "5",
      "-i",
      url,
    ];

    // MPEG-TS carries H.264/AAC (and little else) in a form every player understands. Anything newer —
    // AV1, VP9, HEVC, Opus, which is what many sites serve — needs fragmented MP4 segments, which
    // hls.js and Safari both play. The source is probed first so the common case keeps TS.
    const fmp4 = await this.needsFmp4([sourceUrl, ...(audioUrl ? [audioUrl] : [])], headerArgs);
    const hlsArgs = [
      "-c",
      "copy",
      "-start_number",
      "0",
      "-hls_time",
      "6",
      "-hls_list_size",
      "0",
      "-hls_playlist_type",
      "event",
      "-hls_flags",
      "temp_file",
      ...(fmp4 ? ["-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4"] : []),
      "-hls_segment_filename",
      `${cacheDir}/%03d.${fmp4 ? "m4s" : "ts"}`,
      `${cacheDir}/playlist.m3u8`,
    ];

    // Attempt 1: ffmpeg reads the stream URL itself (cheapest, works for most sources).
    // Attempt 2 (platform links only): yt-dlp downloads and feeds ffmpeg through a pipe. Some CDNs —
    // TikTok's, notably — answer 403 to anything but the extractor's own session cookies, which
    // yt-dlp keeps to itself and never puts into the URL or headers it reports.
    const attempts: Array<"direct" | "pipe"> =
      pageUrl && this.resolver.isExtractorHost(pageUrl) ? ["direct", "pipe"] : ["direct"];

    let announcedReady = false;
    let lastReason = "";

    for (const mode of attempts) {
      const spawned =
        mode === "direct"
          ? {
              ffmpeg: Bun.spawn(
                [
                  "ffmpeg",
                  "-y",
                  ...input(sourceUrl),
                  ...(audioUrl ? [...input(audioUrl), "-map", "0:v:0", "-map", "1:a:0"] : []),
                  ...hlsArgs,
                ],
                { stdout: "pipe", stderr: "pipe" },
              ),
              downloader: undefined,
            }
          : this.spawnPipeline(pageUrl as string, hlsArgs);

      const proc = spawned.ffmpeg;
      let timedOut = false;
      const timeout = setTimeout(
        () => {
          timedOut = true;
          proc.kill();
          spawned.downloader?.kill();
        },
        isLive ? LIVE_CAPTURE_TIMEOUT_MS : REMUX_TIMEOUT_MS,
      );

      // Playback starts as soon as a few segments exist: a two-hour film takes many minutes to
      // download in full, and nobody should stare at a spinner for that long. The playlist is an
      // HLS "event" playlist — it keeps growing while ffmpeg works and gets its ENDLIST at the end.
      const readyWatcher = setInterval(async () => {
        if (announcedReady) return;
        const segments = await this.cache.countSegmentsInPlaylist(assetHash);
        if (segments >= READY_AFTER_SEGMENTS) {
          announcedReady = true;
          await this.markReady(assetId, cacheDir).catch(() => {});
          this.logger.log(`asset ${assetId} playable after ${segments} segments (download continues)`);
        }
      }, 1000);

      const [exitCode, stderrText] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
      clearTimeout(timeout);
      clearInterval(readyWatcher);
      spawned.downloader?.kill();

      if (exitCode === 0) {
        if (!announcedReady) await this.markReady(assetId, cacheDir);
        this.logger.log(`asset ${assetId} fully downloaded at ${cacheDir} (${mode})`);
        return;
      }

      lastReason = timedOut
        ? `Источник отдаёт видео слишком медленно — обработка прервана по таймауту (${REMUX_TIMEOUT_MS / 3_600_000} ч).`
        : humanizeFfmpegError(stderrText);
      this.logger.error(
        `ffmpeg (${mode}) failed for asset ${assetId} (exit ${exitCode}, timedOut=${timedOut}): ${stderrText.split("\n").slice(-4).join(" | ")}`,
      );

      if (announcedReady) break; // people are watching already — keep what we have, do not retry over it
      if (timedOut) break;
    }

    if (announcedReady) {
      // Keep what was downloaded and close the playlist so the player ends cleanly instead of
      // waiting forever for segments that will never come.
      await this.cache.closePlaylist(assetHash);
      return;
    }
    await this.markFailed(assetId, lastReason);
  }

  // True when any stream is something MPEG-TS cannot carry for a browser. Unknown (probe failed or
  // timed out) means "no": the proven TS path stays the default.
  private async needsFmp4(urls: string[], headerArgs: string[]): Promise<boolean> {
    const TS_VIDEO = new Set(["h264"]);
    const TS_AUDIO = new Set(["aac", "mp3", "ac3", "eac3", "mp2"]);
    for (const url of urls) {
      try {
        const proc = Bun.spawn(
          [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,codec_name",
            "-of",
            "csv=p=0",
            ...(/\.m3u8(\?|#|$)/i.test(url) ? ["-allowed_extensions", "ALL"] : []),
            ...headerArgs,
            "-i",
            url,
          ],
          { stdout: "pipe", stderr: "ignore" },
        );
        const timer = setTimeout(() => proc.kill(), 25_000);
        const out = await new Response(proc.stdout).text();
        clearTimeout(timer);
        for (const line of out.split("\n")) {
          const [codec, type] = line.trim().split(",");
          if (type === "video" && !TS_VIDEO.has(codec)) return true;
          if (type === "audio" && !TS_AUDIO.has(codec)) return true;
        }
      } catch {
        // ffprobe missing or failed: fall back to the default container
      }
    }
    return false;
  }

  private spawnPipeline(pageUrl: string, hlsArgs: string[]) {
    const downloader = Bun.spawn(
      [
        "yt-dlp",
        "-f",
        "b[height<=1080]/b",
        "--no-playlist",
        "--no-warnings",
        // yt-dlp's own ffmpeg downloader carries the extractor's cookies and headers to the CDN, and
        // MPEG-TS is a container that can be read from a pipe (an mp4 with its index at the end cannot).
        "--downloader",
        "ffmpeg",
        "--downloader-args",
        "ffmpeg_o:-c copy -f mpegts",
        "-o",
        "-",
        pageUrl,
      ],
      { stdout: "pipe", stderr: "ignore" },
    );
    const ffmpeg = Bun.spawn(["ffmpeg", "-y", "-i", "pipe:0", ...hlsArgs], {
      stdin: downloader.stdout,
      stdout: "pipe",
      stderr: "pipe",
    });
    return { ffmpeg, downloader };
  }
}

// ffmpeg's stderr starts with a screenful of build info; the useful part is the last lines. The raw
// text is not something to show a viewer, so the common causes get a plain sentence.
function humanizeFfmpegError(stderr: string): string {
  const lines = stderr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const tail = lines.slice(-6).join(" ");
  if (/HTTP error 4(01|03)|Server returned 4(01|03)/.test(tail))
    return "Источник закрыл доступ к видео (ошибка 403). Попробуйте другую ссылку.";
  if (/HTTP error 404|Server returned 404/.test(tail))
    return "Видео по этой ссылке не найдено — возможно, оно удалено.";
  if (/Invalid data found|moov atom not found/.test(tail))
    return "Не удалось прочитать видео: файл повреждён или не полностью загружен.";
  return "Не удалось обработать видео. Попробуйте другую ссылку или повторите позже.";
}
