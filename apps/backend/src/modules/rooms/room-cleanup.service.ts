import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, inArray, lt } from "drizzle-orm";
import type Redis from "ioredis";
import type { Env } from "../../config/env.schema";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { rooms } from "../../database/schema";
import { REDIS_CLIENT } from "../../redis/redis.module";

// Rooms are cheap to make and nobody comes back to most of them, so an unused room disappears by
// itself after a day. "Used" means anything: somebody joined, wrote, pressed play, queued a video, or
// simply sits in it (the heartbeat keeps a watched room alive). Deleting a room cascades to its
// members, messages and queue; the video files fall to the cache's own TTL.
@Injectable()
export class RoomCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomCleanupService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    const every = this.config.get("ROOM_CLEANUP_INTERVAL_MS", { infer: true });
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.warn(`room sweep failed: ${e}`)), every);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<number> {
    const every = this.config.get("ROOM_CLEANUP_INTERVAL_MS", { infer: true });
    // Several replicas run their own timer: only one sweeps per interval.
    const won = await this.redis.set("room-cleanup:lock", "1", "PX", Math.max(1000, Math.floor(every / 2)), "NX");
    if (won !== "OK") return 0;

    const idleHours = this.config.get("ROOM_IDLE_HOURS", { infer: true });
    const cutoff = new Date(Date.now() - idleHours * 60 * 60 * 1000);
    const stale = await this.db.select({ id: rooms.id }).from(rooms).where(lt(rooms.lastActiveAt, cutoff));
    if (stale.length === 0) return 0;

    // Somebody who is connected right now keeps the room, whatever the timestamp says.
    const occupied = new Set<string>();
    for (const { id } of stale) {
      if ((await this.redis.hlen(`room:${id}:sockets`)) > 0) occupied.add(id);
    }
    const doomed = stale.map((r) => r.id).filter((id) => !occupied.has(id));
    if (doomed.length === 0) return 0;

    await this.db.delete(rooms).where(and(inArray(rooms.id, doomed), lt(rooms.lastActiveAt, cutoff)));
    this.logger.log(`removed ${doomed.length} idle room(s) (no activity for ${idleHours} h)`);
    return doomed.length;
  }
}
