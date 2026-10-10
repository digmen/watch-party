import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { asc, eq, lt } from "drizzle-orm";
import type Redis from "ioredis";
import type { Env } from "../../config/env.schema";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { videoAssets } from "../../database/schema";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { VideoCacheService } from "./video-cache.service";

const LOCK_KEY = "video-cache-cleanup:lock";
const LOCK_TTL_SEC = 240;
// Anything touched this recently may be on someone's screen right now — never evicted for space.
const IN_USE_WINDOW_MS = 30 * 60 * 1000;

// VIDEO_CACHE_TTL_HOURS раньше только парсился (см. env.schema.ts) — сам кэш ничего не чистил
// (README/TODO проекта прямо называли это открытым вопросом). Диск не резиновый: без эвикции
// каждая когда-либо открытая ссылка остаётся на диске навсегда.
@Injectable()
export class VideoCacheCleanupService {
  private readonly logger = new Logger(VideoCacheCleanupService.name);
  private readonly instanceId = randomUUID();

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
    private readonly cache: VideoCacheService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async evictStaleAssets(): Promise<void> {
    // Та же блокировка, что у чистки гостей: реплик может быть несколько, планировщик у
    // каждой свой, без лока N реплик одновременно начнут тереть одни и те же файлы.
    const won = await this.redis.set(LOCK_KEY, this.instanceId, "EX", LOCK_TTL_SEC, "NX");
    if (won !== "OK") return;

    const ttlHours = this.config.get("VIDEO_CACHE_TTL_HOURS", { infer: true });
    const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);

    // lastAccessedAt bump'ается при каждом реальном обращении (video.service.ts) — значит
    // "старше TTL" здесь буквально значит "никто не смотрел дольше TTL", а не "давно добавили".
    const stale = await this.db
      .select({ id: videoAssets.id, sourceUrlHash: videoAssets.sourceUrlHash })
      .from(videoAssets)
      .where(lt(videoAssets.lastAccessedAt, cutoff));

    if (stale.length > 0) await this.evictStale(stale, cutoff, ttlHours);
    await this.enforceSizeCap();
  }

  // Oldest-used first, until the cache fits. The point of the cap is the shared disk: it is checked
  // every ten minutes because a single long film can add several GB between two hourly runs.
  private async enforceSizeCap(): Promise<void> {
    const capBytes = this.config.get("VIDEO_CACHE_MAX_GB", { infer: true }) * 1024 ** 3;
    const assets = await this.db
      .select({ id: videoAssets.id, hash: videoAssets.sourceUrlHash, last: videoAssets.lastAccessedAt })
      .from(videoAssets)
      .orderBy(asc(videoAssets.lastAccessedAt));

    const sized = await Promise.all(assets.map(async (a) => ({ ...a, bytes: await this.cache.dirSizeBytes(a.hash) })));
    let total = sized.reduce((sum, a) => sum + a.bytes, 0);
    if (total <= capBytes) return;

    let evicted = 0;
    for (const a of sized) {
      if (total <= capBytes) break;
      if (Date.now() - a.last.getTime() < IN_USE_WINDOW_MS || a.bytes === 0) continue;
      await this.cache.evictDir(a.hash);
      await this.db.delete(videoAssets).where(eq(videoAssets.id, a.id));
      total -= a.bytes;
      evicted++;
    }
    this.logger.warn(
      `video cache over ${(capBytes / 1024 ** 3).toFixed(0)} GB: evicted ${evicted} least-recently-used asset(s)`,
    );
  }

  private async evictStale(
    stale: Array<{ id: string; sourceUrlHash: string }>,
    cutoff: Date,
    ttlHours: number,
  ): Promise<void> {
    for (const asset of stale) {
      await this.cache.evictDir(asset.sourceUrlHash);
    }
    // Тот же предикат, что и в SELECT выше: за время цикла эвикции могла набежать ещё одна
    // просроченная запись — не страшно, она попадёт в неё же тоже (её каталога тогда ещё не
    // тронули) и просто уйдёт следующим прогоном, если сейчас не попадёт под lt().
    await this.db.delete(videoAssets).where(lt(videoAssets.lastAccessedAt, cutoff));

    this.logger.log(`evicted ${stale.length} stale video asset(s), unused > ${ttlHours}h`);
  }
}
