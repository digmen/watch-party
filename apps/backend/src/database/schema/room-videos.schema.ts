import { sql } from "drizzle-orm";
import { integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { rooms } from "./rooms.schema";
import { users } from "./users.schema";
import { videoAssets } from "./video-assets.schema";

export const roomVideos = pgTable("room_videos", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  videoAssetId: uuid("video_asset_id")
    .notNull()
    .references(() => videoAssets.id, { onDelete: "cascade" }),
  addedBy: uuid("added_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  queuePosition: integer("queue_position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RoomVideo = typeof roomVideos.$inferSelect;
export type NewRoomVideo = typeof roomVideos.$inferInsert;
