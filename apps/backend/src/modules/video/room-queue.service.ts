import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { QueueItemDto } from "@watch-party/shared";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { type RoomVideo, roomVideos, users, type VideoAsset, videoAssets } from "../../database/schema";

// The room's playlist. A room has at most one "playing" row — the current video — and any number of
// "queued" rows in `queuePosition` order; "done" rows are history. This service only moves rows
// between those states; telling the room about it (and resetting playback) is VideoService's job.
@Injectable()
export class RoomQueueService {
  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb) {}

  async list(roomId: string): Promise<QueueItemDto[]> {
    const rows = await this.db
      .select({
        item: roomVideos,
        asset: videoAssets,
        addedByName: users.displayName,
      })
      .from(roomVideos)
      .innerJoin(videoAssets, eq(roomVideos.videoAssetId, videoAssets.id))
      .innerJoin(users, eq(roomVideos.addedBy, users.id))
      .where(and(eq(roomVideos.roomId, roomId), inArray(roomVideos.status, ["playing", "queued"])))
      .orderBy(asc(roomVideos.queuePosition), asc(roomVideos.createdAt));

    const items = rows.map((r) => ({
      id: r.item.id,
      assetId: r.asset.id,
      status: r.item.status,
      position: r.item.queuePosition,
      title: r.asset.title,
      sourceUrl: r.asset.sourceUrl,
      assetStatus: r.asset.status,
      addedByName: r.addedByName,
      addedById: r.item.addedBy,
    }));
    // The current video first, then the queue in order.
    return [...items.filter((i) => i.status === "playing"), ...items.filter((i) => i.status === "queued")];
  }

  async current(roomId: string): Promise<{ item: RoomVideo; asset: VideoAsset } | undefined> {
    const [row] = await this.db
      .select({ item: roomVideos, asset: videoAssets })
      .from(roomVideos)
      .innerJoin(videoAssets, eq(roomVideos.videoAssetId, videoAssets.id))
      .where(and(eq(roomVideos.roomId, roomId), eq(roomVideos.status, "playing")))
      .limit(1);
    return row;
  }

  // Adds a video. If nothing is playing it becomes the current video at once; otherwise it joins the
  // end of the queue. `becameCurrent` tells the caller whether the room has to switch pictures.
  async enqueue(roomId: string, assetId: string, userId: string): Promise<{ item: RoomVideo; becameCurrent: boolean }> {
    return this.db.transaction(async (tx) => {
      let [playing] = await tx
        .select({ id: roomVideos.id, assetStatus: videoAssets.status })
        .from(roomVideos)
        .innerJoin(videoAssets, eq(roomVideos.videoAssetId, videoAssets.id))
        .where(and(eq(roomVideos.roomId, roomId), eq(roomVideos.status, "playing")))
        .limit(1);
      // A current video that failed to prepare is dead weight: the next one added replaces it
      // instead of waiting behind it forever.
      if (playing?.assetStatus === "failed") {
        await tx.update(roomVideos).set({ status: "done" }).where(eq(roomVideos.id, playing.id));
        playing = undefined as never;
      }

      const [last] = await tx
        .select({ pos: max(roomVideos.queuePosition) })
        .from(roomVideos)
        .where(and(eq(roomVideos.roomId, roomId), eq(roomVideos.status, "queued")));

      const [item] = await tx
        .insert(roomVideos)
        .values({
          roomId,
          videoAssetId: assetId,
          addedBy: userId,
          status: playing ? "queued" : "playing",
          queuePosition: playing ? (last?.pos ?? 0) + 1 : 0,
        })
        .returning();
      return { item, becameCurrent: !playing };
    });
  }

  // Current -> done, first queued -> playing. Returns the new current row (or null if the queue is empty,
  // in which case the finished video simply stays on screen).
  async advance(roomId: string): Promise<{ item: RoomVideo; asset: VideoAsset } | null> {
    const next = await this.db.transaction(async (tx) => {
      const [candidate] = await tx
        .select({ id: roomVideos.id })
        .from(roomVideos)
        .where(and(eq(roomVideos.roomId, roomId), eq(roomVideos.status, "queued")))
        .orderBy(asc(roomVideos.queuePosition), asc(roomVideos.createdAt))
        .limit(1);
      if (!candidate) return null;
      await tx
        .update(roomVideos)
        .set({ status: "done" })
        .where(and(eq(roomVideos.roomId, roomId), eq(roomVideos.status, "playing")));
      await tx.update(roomVideos).set({ status: "playing", queuePosition: 0 }).where(eq(roomVideos.id, candidate.id));
      return candidate.id;
    });
    return next ? ((await this.current(roomId)) ?? null) : null;
  }

  // Make a specific queued item the current one right now (the previous current goes to history).
  async playNow(roomId: string, itemId: string): Promise<{ item: RoomVideo; asset: VideoAsset }> {
    await this.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: roomVideos.id, status: roomVideos.status })
        .from(roomVideos)
        .where(and(eq(roomVideos.id, itemId), eq(roomVideos.roomId, roomId)))
        .limit(1);
      if (!target) throw new NotFoundException("Такого видео нет в очереди");
      await tx
        .update(roomVideos)
        .set({ status: "done" })
        .where(and(eq(roomVideos.roomId, roomId), eq(roomVideos.status, "playing")));
      await tx.update(roomVideos).set({ status: "playing", queuePosition: 0 }).where(eq(roomVideos.id, itemId));
    });
    const current = await this.current(roomId);
    if (!current) throw new NotFoundException("Такого видео нет в очереди");
    return current;
  }

  // Removes a queued item. The owner may remove anything; anyone else only what they added themselves.
  async remove(roomId: string, itemId: string, requesterId: string, isOwner: boolean): Promise<void> {
    const [row] = await this.db
      .select()
      .from(roomVideos)
      .where(and(eq(roomVideos.id, itemId), eq(roomVideos.roomId, roomId)))
      .limit(1);
    if (!row) throw new NotFoundException("Такого видео нет в очереди");
    if (row.status === "playing") throw new ForbiddenException("Играющее видео нельзя убрать — выберите следующее");
    if (!isOwner && row.addedBy !== requesterId) throw new ForbiddenException("Убрать можно только своё видео");
    await this.db.delete(roomVideos).where(eq(roomVideos.id, itemId));
  }

  // Rewrites the order of the queued items. Unknown ids are ignored; queued items missing from `order`
  // keep their relative order after the listed ones.
  async reorder(roomId: string, order: string[]): Promise<void> {
    const queued = await this.db
      .select({ id: roomVideos.id })
      .from(roomVideos)
      .where(and(eq(roomVideos.roomId, roomId), eq(roomVideos.status, "queued")))
      .orderBy(asc(roomVideos.queuePosition), asc(roomVideos.createdAt));
    const known = new Set(queued.map((q) => q.id));
    const sequence = [
      ...order.filter((id) => known.has(id)),
      ...queued.map((q) => q.id).filter((id) => !order.includes(id)),
    ];
    await this.db.transaction(async (tx) => {
      for (const [index, id] of sequence.entries()) {
        await tx
          .update(roomVideos)
          .set({ queuePosition: index + 1 })
          .where(eq(roomVideos.id, id));
      }
    });
  }
}
