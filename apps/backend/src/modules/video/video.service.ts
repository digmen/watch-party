import { InjectQueue } from "@nestjs/bullmq";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Queue } from "bullmq";
import { desc, eq } from "drizzle-orm";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { roomVideos, type VideoAsset, videoAssets } from "../../database/schema";
import { hashUrl } from "./video-cache.service";
import type { PrefetchJobData } from "./video-prefetch.processor";
import { VideoResolverService } from "./video-resolver.service";

const NEEDS_EXTRACTION_MESSAGE =
  "Provide a direct video file or HLS/DASH manifest URL — arbitrary page extraction isn't implemented in this MVP.";

@Injectable()
export class VideoService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    private readonly resolver: VideoResolverService,
    @InjectQueue("video-prefetch") private readonly queue: Queue<PrefetchJobData>,
  ) {}

  async addVideoToRoom(roomId: string, sourceUrl: string, userId: string): Promise<VideoAsset> {
    const sourceUrlHash = hashUrl(sourceUrl);
    let [asset] = await this.db.select().from(videoAssets).where(eq(videoAssets.sourceUrlHash, sourceUrlHash)).limit(1);

    if (!asset) {
      const kind = await this.resolver.classify(sourceUrl);
      [asset] = await this.db
        .insert(videoAssets)
        .values({ sourceUrl, sourceUrlHash, kind, status: "pending" })
        .returning();

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
        await this.queue.add(
          "prepare",
          { assetId: asset.id, assetHash: sourceUrlHash, sourceUrl, kind },
          { jobId: sourceUrlHash },
        );
      }
    }

    await this.db.insert(roomVideos).values({ roomId, videoAssetId: asset.id, addedBy: userId });
    return asset;
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
