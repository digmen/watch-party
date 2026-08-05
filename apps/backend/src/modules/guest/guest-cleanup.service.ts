import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { and, eq, gt, isNull, lt, notExists, sql } from "drizzle-orm";
import type Redis from "ioredis";
import type { Env } from "../../config/env.schema";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { refreshTokens, roomMessages, users } from "../../database/schema";
import { REDIS_CLIENT } from "../../redis/redis.module";

const LOCK_KEY = "guest-cleanup:lock";
const LOCK_TTL_SEC = 3600;

@Injectable()
export class GuestCleanupService {
  private readonly logger = new Logger(GuestCleanupService.name);
  private readonly instanceId = randomUUID();

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async reapStaleGuests(): Promise<void> {
    // Every replica runs its own scheduler, so this needs the same Redis NX lock the playback
    // heartbeat uses (see playback-state.service.ts) — otherwise N replicas race the same delete.
    const won = await this.redis.set(LOCK_KEY, this.instanceId, "EX", LOCK_TTL_SEC, "NX");
    if (won !== "OK") return;

    const ttlDays = this.config.get("GUEST_TTL_DAYS", { infer: true });
    const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);
    const now = new Date();

    const deleted = await this.db
      .delete(users)
      .where(
        and(
          eq(users.isGuest, true),
          lt(users.createdAt, cutoff),
          // Never evict someone who is still watching: a live refresh token means an active
          // session, and deleting the row would log them out mid-film.
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(refreshTokens)
              .where(
                and(
                  eq(refreshTokens.userId, users.id),
                  isNull(refreshTokens.revokedAt),
                  gt(refreshTokens.expiresAt, now),
                ),
              ),
          ),
          // room_messages.user_id is ON DELETE CASCADE, so removing a guest who spoke would
          // silently erase their lines from the room's chat history. A users row costs ~100 bytes;
          // keeping the ones that participated is the cheaper trade by far.
          notExists(this.db.select({ one: sql`1` }).from(roomMessages).where(eq(roomMessages.userId, users.id))),
        ),
      )
      .returning({ id: users.id });

    if (deleted.length > 0) this.logger.log(`reaped ${deleted.length} stale guest account(s)`);
  }
}
