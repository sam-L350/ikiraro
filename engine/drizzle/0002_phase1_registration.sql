ALTER TABLE "consents" ADD COLUMN "granted" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "activated_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "users" SET "activated_at" = "created_at" WHERE "activated_at" IS NULL;