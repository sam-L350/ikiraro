CREATE TABLE "badge_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"earned_badge_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"verifier_user_id" integer NOT NULL,
	"awarded_at" timestamp with time zone NOT NULL,
	"content_hash" text NOT NULL,
	"signature" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "badge_credentials_earned_badge_id_unique" UNIQUE ("earned_badge_id"),
	CONSTRAINT "badge_credentials_token_unique" UNIQUE ("token"),
	CONSTRAINT "badge_credentials_issuer" CHECK (char_length(btrim("issuer")) between 1 and 80),
	CONSTRAINT "badge_credentials_hash" CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "badge_credentials_signature" CHECK ("signature" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "badge_credentials_token" CHECK (char_length("token") between 43 and 80)
);
--> statement-breakpoint
ALTER TABLE "badge_credentials" ADD CONSTRAINT "badge_credentials_earned_badge_id_earned_badges_id_fk" FOREIGN KEY ("earned_badge_id") REFERENCES "public"."earned_badges"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "badge_credentials" ADD CONSTRAINT "badge_credentials_verifier_user_id_users_id_fk" FOREIGN KEY ("verifier_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER IF EXISTS badge_credentials_append_only ON badge_credentials;
--> statement-breakpoint
CREATE TRIGGER badge_credentials_append_only
BEFORE UPDATE OR DELETE ON badge_credentials
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
