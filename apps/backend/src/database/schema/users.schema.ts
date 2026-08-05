import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  // Nullable because a guest has no email. Postgres UNIQUE indexes are NULLS DISTINCT by default,
  // so any number of guest rows coexist here — and `findByEmail` / `upsertGoogleUser` stay correct
  // for free, since `= NULL` never matches. (A synthetic guest@… address would instead make both
  // of those silently able to return, or collide with, a guest.)
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name").notNull(),
  isGuest: boolean("is_guest").notNull().default(false),
  // Scopes a guest to the one room they were invited to. Deliberately NOT a foreign key:
  // rooms.schema.ts already imports this module, and the reverse reference would create a real
  // import cycle. Guest rows are reaped by the cleanup job instead of by cascade.
  guestRoomId: uuid("guest_room_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
