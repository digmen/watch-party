import { InjectQueue } from "@nestjs/bullmq";
import { Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import { desc, eq, inArray } from "drizzle-orm";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { roomVideos, type VideoAsset, videoAssets } from "../../database/schema";
import { RoomGateway } from "../gateway/room.gateway";
import { toVideoAssetDto } from "./video.presenter";
import { hashUrl } from "./video-cache.service";
import type { PrefetchJobData } from "./video-prefetch.processor";
import { VideoResolverService } from "./video-resolver.service";

const NEEDS_EXTRACTION_MESSAGE =
  "Provide a direct video file or HLS/DASH manifest URL — arbitrary page extraction isn't implemented in this MVP.";

const INTERRUPTED_MESSAGE = "Обработка прервалась (сервер перезапустился). Отправьте ссылку ещё раз.";

@Injectable()
export class VideoService implements OnModuleInit {
  private readonly logger = new Logger(VideoService.name);

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly resolver: VideoResolverService,
    private readonly gateway: RoomGateway,
    @InjectQueue("video-prefetch") private readonly queue: Queue<PrefetchJobData>,
  ) {}

  // A non-terminal status only means anything while a worker is alive to advance it. If the
  // process died mid-job (redeploy, OOM, crash), the row is left claiming "processing" with
  // nobody working on it and — before this — no way out: the retry path only accepted "failed",
  // and the UI hides the input while processing. Reconciling at boot is what makes that
  // self-healing instead of permanent.
  async onModuleInit(): Promise<void> {
    const unfinished = await this.db
      .select()
      .from(videoAssets)
      .where(inArray(videoAssets.status, ["pending", "processing"]));
    if (unfinished.length === 0) return;

    const orphaned: string[] = [];
    for (const asset of unfinished) {
      const job = await this.queue.getJob(asset.sourceUrlHash);
      // A job that still exists is either waiting or genuinely running under another replica —
      // leave those alone; only rows with no job behind them are stranded.
      if (!job) orphaned.push(asset.id);
    }
    if (orphaned.length === 0) return;

    await this.db
      .update(videoAssets)
      .set({ status: "failed", failureReason: INTERRUPTED_MESSAGE })
      .where(inArray(videoAssets.id, orphaned));
    this.logger.warn(`released ${orphaned.length} video asset(s) stranded mid-processing by a restart`);
  }

  async addVideoToRoom(roomId: string, sourceUrl: string, userId: string): Promise<VideoAsset> {
    const sourceUrlHash = hashUrl(sourceUrl);
    let [asset] = await this.db.select().from(videoAssets).where(eq(videoAssets.sourceUrlHash, sourceUrlHash)).limit(1);

    // Re-attempt anything that isn't finished and isn't actually being worked on: a previously
    // failed asset (a transient yt-dlp/network hiccup shouldn't poison that URL forever), and
    // — the case that stranded a video for good — one still claiming `pending`/`processing` with
    // no live job behind it. Only `ready` and genuinely in-flight assets are reused as-is.
    const isUnfinished = asset && asset.status !== "ready";
    const isStranded = isUnfinished && !(await this.queue.getJob(sourceUrlHash));

    if (!asset || asset.status === "failed" || isStranded) {
      const fastKind = await this.resolver.classifyFast(sourceUrl);
      // `fastKind` is only ever wrong in one direction: a URL on the extractor allowlist (ok.ru,
      // vk.com/vkvideo.ru) whose page isn't itself extension/content-type recognizable. Store a
      // provisional "direct_mp4" guess for those — the BullMQ job re-resolves through yt-dlp
      // (40-90s, not something to run in this HTTP request) and corrects `kind` for real before
      // it matters for processing. `kind` is never shown to the user while status is pending.
      const isProvisional = fastKind === "needs_extraction" && this.resolver.isExtractorHost(sourceUrl);
      const kind = isProvisional ? "direct_mp4" : fastKind;

      if (!asset) {
        [asset] = await this.db
          .insert(videoAssets)
          .values({ sourceUrl, sourceUrlHash, kind, status: "pending" })
          .returning();
      } else {
        [asset] = await this.db
          .update(videoAssets)
          .set({ kind, status: "pending", failureReason: null })
          .where(eq(videoAssets.id, asset.id))
          .returning();
      }

      if (kind === "needs_extraction") {
        await this.db
          .update(videoAssets)
          .set({ status: "failed", failureReason: NEEDS_EXTRACTION_MESSAGE })
          .where(eq(videoAssets.id, asset.id));
        asset.status = "failed";
        asset.failureReason = NEEDS_EXTRACTION_MESSAGE;
      } else {
        // jobId = sourceUrlHash: BullMQ refuses duplicate job IDs, which is the entire dedup
        // mechanism for "don't remux the same source twice concurrently" — no separate lock needed.
        //
        // That same dedup is why a finished job has to be cleared first: `queue.add` with an
        // existing jobId silently returns the old job instead of enqueuing work, so a leftover
        // record (failed ones are now kept for an hour so the failure listener can read them)
        // would turn every retry into a no-op — the exact shape of bug that stranded assets
        // before. Removing it makes "submit the same URL again" genuinely re-run.
        await this.queue.remove(sourceUrlHash).catch(() => undefined);
        await this.queue.add(
          "prepare",
          { assetId: asset.id, assetHash: sourceUrlHash, sourceUrl, kind },
          { jobId: sourceUrlHash },
        );
      }
    }

    await this.db.insert(roomVideos).values({ roomId, videoAssetId: asset.id, addedBy: userId });
    // Everyone already in the room switches to the new video immediately — including the case
    // where it's still `pending`, so their UI shows "preparing" instead of the previous film.
    this.gateway.broadcastVideoChanged(roomId, toVideoAssetDto(asset));
    return asset;
  }

  // Which rooms currently show this asset — used by the prefetch worker to announce readiness.
  async roomIdsForAsset(assetId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ roomId: roomVideos.roomId })
      .from(roomVideos)
      .where(eq(roomVideos.videoAssetId, assetId));
    return rows.map((r) => r.roomId);
  }

  // MVP simplification: rooms don't have a real playback queue yet — the frontend just treats
  // the most recently added video as "the" current one. A `queuePosition`-driven playlist is a
  // straightforward extension of `room_videos` later, not a schema change.
  async getLatestForRoom(roomId: string): Promise<VideoAsset | undefined> {
    const [row] = await this.db
      .select({ asset: videoAssets })
      .from(roomVideos)
      .innerJoin(videoAssets, eq(roomVideos.videoAssetId, videoAssets.id))
      .where(eq(roomVideos.roomId, roomId))
      .orderBy(desc(roomVideos.createdAt))
      .limit(1);
    return row?.asset;
  }

  async getAsset(assetId: string): Promise<VideoAsset> {
    const [asset] = await this.db.select().from(videoAssets).where(eq(videoAssets.id, assetId)).limit(1);
    if (!asset) throw new NotFoundException("Video asset not found");
    return asset;
  }

  async touchLastAccessed(assetId: string): Promise<void> {
    await this.db.update(videoAssets).set({ lastAccessedAt: new Date() }).where(eq(videoAssets.id, assetId));
  }
}
