import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const VIDEO_KINDS = ["direct_mp4", "hls", "dash", "needs_extraction"] as const;
export const VIDEO_STATUSES = ["pending", "processing", "ready", "failed"] as const;

export const videoAssets = pgTable("video_assets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceUrlHash: text("source_url_hash").notNull().unique(),
  sourceUrl: text("source_url").notNull(),
  kind: text("kind", { enum: VIDEO_KINDS }).notNull(),
  status: text("status", { enum: VIDEO_STATUSES }).notNull().default("pending"),
  storagePath: text("storage_path"),
  durationSec: integer("duration_sec"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VideoAsset = typeof videoAssets.$inferSelect;
export type NewVideoAsset = typeof videoAssets.$inferInsert;
