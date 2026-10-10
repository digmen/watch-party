ALTER TABLE "rooms" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN "title" text;