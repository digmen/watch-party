import { Controller, Get, Inject } from "@nestjs/common";
import { HealthCheck, HealthCheckService, type HealthIndicatorResult } from "@nestjs/terminus";
import { sql } from "drizzle-orm";
import Redis from "ioredis";
import { DRIZZLE_CLIENT, type DrizzleDb } from "../../database/drizzle.module";
import { REDIS_CLIENT } from "../../redis/redis.module";

@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    @Inject(DRIZZLE_CLIENT) private readonly db: DrizzleDb,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => {
        try {
          await this.db.execute(sql`select 1`);
          return { database: { status: "up" } };
        } catch (err) {
          return { database: { status: "down", message: (err as Error).message } };
        }
      },
      async (): Promise<HealthIndicatorResult> => {
        try {
          await this.redis.ping();
          return { redis: { status: "up" } };
        } catch (err) {
          return { redis: { status: "down", message: (err as Error).message } };
        }
      },
    ]);
  }
}
