ALTER TABLE "room_videos" ADD COLUMN "status" text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "queue_add_policy" text DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Existing rooms: everything added so far is history, except the latest video per room which is the current one.
UPDATE "room_videos" SET "status" = 'done';--> statement-breakpoint
UPDATE "room_videos" SET "status" = 'playing' WHERE "id" IN (SELECT DISTINCT ON ("room_id") "id" FROM "room_videos" ORDER BY "room_id", "created_at" DESC);--> statement-breakpoint
-- Public rooms start with "only the owner adds to the queue".
UPDATE "rooms" SET "queue_add_policy" = 'owner' WHERE "visibility" = 'public';
