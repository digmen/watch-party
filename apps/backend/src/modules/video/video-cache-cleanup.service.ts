import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { lt } from "drizzle-orm";
import type Redis from "ioredis";
import type { Env } from "../../config/env.schema";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { videoAssets } from "../../database/schema";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { VideoCacheService } from "./video-cache.service";

const LOCK_KEY = "video-cache-cleanup:lock";
const LOCK_TTL_SEC = 3600;

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

  @Cron(CronExpression.EVERY_HOUR)
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

    if (stale.length === 0) return;

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
