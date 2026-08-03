import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Env } from "../config/env.schema";
import * as schema from "./schema";

export const DRIZZLE_CLIENT = Symbol("DRIZZLE_CLIENT");
export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const sql = postgres(config.get("DATABASE_URL", { infer: true }));
        return drizzle(sql, { schema });
      },
    },
  ],
  exports: [DRIZZLE_CLIENT],
})
export class DrizzleModule {}
