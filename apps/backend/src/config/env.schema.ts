import { z } from "zod";

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  BACKEND_PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_ORIGIN: z.string().url(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  COOKIE_SECRET: z.string().min(16),
  CSRF_SECRET: z.string().min(16),

  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_CALLBACK_URL: z.string().url().optional(),

  VIDEO_CACHE_PATH: z.string().default("/data/video-cache"),
  VIDEO_CACHE_TTL_HOURS: z.coerce.number().int().positive().default(24),
  // Hard ceiling for the whole cache: a 2-hour film is 3-5 GB, and the disk is shared with other things.
  VIDEO_CACHE_MAX_GB: z.coerce.number().positive().default(15),
  MAX_CONCURRENT_STREAMS: z.coerce.number().int().positive().default(8),

  // A room link is a bearer credential, so guest creation needs a ceiling that doesn't depend on
  // per-IP throttling (which is unreliable behind the tunnel — see the trustProxy note in main.ts).
  MAX_GUESTS_PER_ROOM: z.coerce.number().int().positive().default(20),
  GUEST_TTL_DAYS: z.coerce.number().int().positive().default(7),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}
