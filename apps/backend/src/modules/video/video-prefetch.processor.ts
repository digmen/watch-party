import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { videoAssets } from "../../database/schema";
import { VideoCacheService } from "./video-cache.service";

export interface PrefetchJobData {
  assetId: string;
  assetHash: string;
  sourceUrl: string;
  kind: "direct_mp4" | "hls" | "dash";
}

// Remux (`-c copy`), never re-encode: this just repackages the container into HLS segments
// without touching the video/audio streams, so it costs a fraction of a second of CPU per second
// of video instead of a full decode+encode pass — see the deploy-target note in the plan about
// why re-encoding (AV1/VP9) is deliberately NOT what happens here on a 1 vCPU box.
@Processor("video-prefetch", { concurrency: 1 })
export class VideoPrefetchProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoPrefetchProcessor.name);

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly cache: VideoCacheService,
  ) {
    super();
  }

  async process(job: Job<PrefetchJobData>): Promise<void> {
    const { assetId, assetHash, sourceUrl, kind } = job.data;
    await this.db.update(videoAssets).set({ status: "processing" }).where(eq(videoAssets.id, assetId));

    if (kind === "hls" || kind === "dash") {
      await this.prepareManifestPassthrough(assetId, assetHash, sourceUrl);
      return;
    }

    await this.remuxDirectMp4(assetId, assetHash, sourceUrl);
  }

  private async prepareManifestPassthrough(assetId: string, assetHash: string, sourceUrl: string): Promise<void> {
    try {
      await this.cache.proxyManifest(sourceUrl, assetHash);
      await this.db
        .update(videoAssets)
        .set({ status: "ready", storagePath: this.cache.dirFor(assetHash) })
        .where(eq(videoAssets.id, assetId));
      this.logger.log(`asset ${assetId} manifest proxied and ready`);
    } catch (err) {
      this.logger.error(`manifest proxy failed for asset ${assetId}: ${(err as Error).message}`);
      await this.db
        .update(videoAssets)
        .set({ status: "failed", failureReason: (err as Error).message.slice(0, 2000) })
        .where(eq(videoAssets.id, assetId));
    }
  }

  private async remuxDirectMp4(assetId: string, assetHash: string, sourceUrl: string): Promise<void> {
    this.logger.log(`remuxing asset ${assetId} (${sourceUrl})`);
    const cacheDir = await this.cache.ensureDir(assetHash);

    const proc = Bun.spawn(
      [
        "ffmpeg",
        "-y",
        "-i",
        sourceUrl,
        "-c",
        "copy",
        "-start_number",
        "0",
        "-hls_time",
        "6",
        "-hls_list_size",
        "0",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        `${cacheDir}/%03d.ts`,
        `${cacheDir}/playlist.m3u8`,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );

    const [exitCode, stderrText] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);

    if (exitCode !== 0) {
      const reason = stderrText.split("\n").slice(-10).join("\n");
      this.logger.error(`ffmpeg failed for asset ${assetId} (exit ${exitCode}): ${reason}`);
      await this.db
        .update(videoAssets)
        .set({ status: "failed", failureReason: reason.slice(0, 2000) })
        .where(eq(videoAssets.id, assetId));
      return;
    }

    await this.db
      .update(videoAssets)
      .set({ status: "ready", storagePath: cacheDir })
      .where(eq(videoAssets.id, assetId));
    this.logger.log(`asset ${assetId} ready at ${cacheDir}`);
  }
}
