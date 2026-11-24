CREATE TABLE "mentor_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"sender_user_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_messages_body" CHECK (char_length(btrim("body")) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "mentor_messages" ADD CONSTRAINT "mentor_messages_request_id_mentor_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."mentor_requests"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mentor_messages" ADD CONSTRAINT "mentor_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "mentor_message_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"reporter_user_id" integer NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_message_reports_note" CHECK (char_length(btrim("note")) between 1 and 400)
);
--> statement-breakpoint
ALTER TABLE "mentor_message_reports" ADD CONSTRAINT "mentor_message_reports_message_id_mentor_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."mentor_messages"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mentor_message_reports" ADD CONSTRAINT "mentor_message_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "mentor_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"blocker_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_blocks_request" UNIQUE ("request_id")
);
--> statement-breakpoint
ALTER TABLE "mentor_blocks" ADD CONSTRAINT "mentor_blocks_request_id_mentor_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."mentor_requests"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mentor_blocks" ADD CONSTRAINT "mentor_blocks_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "mentor_contact_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_contact_shares_once" UNIQUE ("request_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "mentor_contact_shares" ADD CONSTRAINT "mentor_contact_shares_request_id_mentor_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."mentor_requests"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mentor_contact_shares" ADD CONSTRAINT "mentor_contact_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "mentor_safeguarding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mentor_user_id" integer NOT NULL,
	"note" text NOT NULL,
	"checked_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_safeguarding_mentor" UNIQUE ("mentor_user_id"),
	CONSTRAINT "mentor_safeguarding_note" CHECK (char_length(btrim("note")) between 1 and 400)
);
--> statement-breakpoint
ALTER TABLE "mentor_safeguarding" ADD CONSTRAINT "mentor_safeguarding_mentor_user_id_users_id_fk" FOREIGN KEY ("mentor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mentor_safeguarding" ADD CONSTRAINT "mentor_safeguarding_checked_by_user_id_users_id_fk" FOREIGN KEY ("checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER IF EXISTS mentor_messages_append_only ON mentor_messages;
--> statement-breakpoint
CREATE TRIGGER mentor_messages_append_only
BEFORE UPDATE OR DELETE ON mentor_messages
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS mentor_message_reports_append_only ON mentor_message_reports;
--> statement-breakpoint
CREATE TRIGGER mentor_message_reports_append_only
BEFORE UPDATE OR DELETE ON mentor_message_reports
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS mentor_blocks_append_only ON mentor_blocks;
--> statement-breakpoint
CREATE TRIGGER mentor_blocks_append_only
BEFORE UPDATE OR DELETE ON mentor_blocks
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS mentor_contact_shares_append_only ON mentor_contact_shares;
--> statement-breakpoint
CREATE TRIGGER mentor_contact_shares_append_only
BEFORE UPDATE OR DELETE ON mentor_contact_shares
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS mentor_safeguarding_append_only ON mentor_safeguarding;
--> statement-breakpoint
CREATE TRIGGER mentor_safeguarding_append_only
BEFORE UPDATE OR DELETE ON mentor_safeguarding
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
