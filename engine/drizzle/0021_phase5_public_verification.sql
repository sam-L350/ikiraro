ALTER TABLE "digital_passports" ADD COLUMN "public_share_token" text;--> statement-breakpoint
ALTER TABLE "digital_passports" ADD COLUMN "visibility" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "digital_passports" ADD CONSTRAINT "digital_passports_public_share_token_unique" UNIQUE("public_share_token");