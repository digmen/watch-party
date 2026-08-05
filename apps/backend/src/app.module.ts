import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ConfigModule as AppConfigModule } from "./config/config.module";
import type { Env } from "./config/env.schema";
import { DrizzleModule } from "./database/drizzle.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ChatModule } from "./modules/chat/chat.module";
import { GatewayModule } from "./modules/gateway/gateway.module";
import { GuestModule } from "./modules/guest/guest.module";
import { HealthModule } from "./modules/health/health.module";
import { RoomsModule } from "./modules/rooms/rooms.module";
import { UsersModule } from "./modules/users/users.module";
import { VideoModule } from "./modules/video/video.module";
import { RedisModule } from "./redis/redis.module";

function parseRedisUrl(redisUrl: string): { host: string; port: number; password?: string } {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
  };
}

@Module({
  imports: [
    AppConfigModule,
    DrizzleModule,
    RedisModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: {
          // BullMQ's blocking commands (BRPOPLPUSH etc.) require this — ioredis's default retry
          // behavior interferes with how BullMQ manages connection-level retries itself.
          maxRetriesPerRequest: null,
          ...parseRedisUrl(config.get("REDIS_URL", { infer: true })),
        },
        defaultJobOptions: {
          // One retry covers the common transient case (origin CDN hiccup, yt-dlp rate limit)
          // without letting a genuinely broken URL churn the single worker slot.
          attempts: 2,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: true,
          // NOT `true`: the @OnWorkerEvent("failed") listener in video-prefetch.processor.ts reads
          // job.data to mark the asset failed, so the record has to outlive the failure. Kept
          // briefly, then reaped so a retry of the same URL isn't blocked by its own jobId.
          removeOnFail: { age: 3600 },
        },
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: "default", ttl: 60_000, limit: 120 }],
    }),
    // Drives the guest-account reaper and the video-cache eviction sweep.
    ScheduleModule.forRoot(),
    UsersModule,
    AuthModule,
    RoomsModule,
    GatewayModule,
    VideoModule,
    ChatModule,
    GuestModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
