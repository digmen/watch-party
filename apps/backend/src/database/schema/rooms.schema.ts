import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.schema";

export const ROOM_VISIBILITIES = ["public", "private"] as const;

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // "private" = reachable only by link (the UUID is the invite); "public" = also listed on the
  // landing page and /public. Existing rooms were all link-only, hence the default.
  visibility: text("visibility", { enum: ROOM_VISIBILITIES }).notNull().default("private"),
  // Argon2id hash of the optional room password; null = no password.
  passwordHash: text("password_hash"),
  // Who may put videos in the queue: every participant, or only the owner.
  queueAddPolicy: text("queue_add_policy", { enum: ["everyone", "owner"] })
    .notNull()
    .default("everyone"),
  // Last time anything happened in the room (join, chat, playback, queue). Rooms idle for a day are removed.
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
