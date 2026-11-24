CREATE TABLE "admin_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'role_change' NOT NULL,
	"reason" text NOT NULL,
	"changes" jsonb NOT NULL,
	"requested_by_user_id" integer NOT NULL,
	"decided_by_user_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "admin_approvals_kind" CHECK ("kind" = 'role_change'),
	CONSTRAINT "admin_approvals_reason" CHECK (char_length(btrim("reason")) between 1 and 400),
	CONSTRAINT "admin_approvals_status" CHECK ("status" in ('pending', 'approved', 'declined')),
	CONSTRAINT "admin_approvals_decision" CHECK ((
		"status" = 'pending'
		and "decided_by_user_id" is null
		and "decision_note" is null
		and "decided_at" is null
	) or (
		"status" = 'approved'
		and "decided_by_user_id" is not null
		and "decided_by_user_id" <> "requested_by_user_id"
		and "decision_note" is null
		and "decided_at" is not null
	) or (
		"status" = 'declined'
		and "decided_by_user_id" is not null
		and "decided_by_user_id" <> "requested_by_user_id"
		and "decision_note" is not null
		and char_length(btrim("decision_note")) between 1 and 400
		and "decided_at" is not null
	))
);
--> statement-breakpoint
ALTER TABLE "admin_approvals" ADD CONSTRAINT "admin_approvals_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_approvals" ADD CONSTRAINT "admin_approvals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "help_guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_en" text NOT NULL,
	"title_rw" text NOT NULL,
	"body_en" text NOT NULL,
	"body_rw" text NOT NULL,
	"walkthrough" text,
	"media_id" uuid,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "help_guides_title_en" CHECK (char_length(btrim("title_en")) between 1 and 200),
	CONSTRAINT "help_guides_title_rw" CHECK (char_length(btrim("title_rw")) between 1 and 200),
	CONSTRAINT "help_guides_body_en" CHECK (char_length(btrim("body_en")) between 1 and 4000),
	CONSTRAINT "help_guides_body_rw" CHECK (char_length(btrim("body_rw")) between 1 and 4000),
	CONSTRAINT "help_guides_walkthrough" CHECK ((
		"walkthrough" is null and "media_id" is null
	) or (
		"walkthrough" in ('audio', 'video') and "media_id" is not null
	))
);
--> statement-breakpoint
ALTER TABLE "help_guides" ADD CONSTRAINT "help_guides_media_id_media_objects_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_objects"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "help_guides" ADD CONSTRAINT "help_guides_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"media_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"owner_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "support_tickets_kind" CHECK ("kind" in ('technical', 'content', 'conduct')),
	CONSTRAINT "support_tickets_body" CHECK (char_length(btrim("body")) between 1 and 4000),
	CONSTRAINT "support_tickets_status" CHECK ("status" in ('open', 'answered', 'closed')),
	CONSTRAINT "support_tickets_times" CHECK ((
		"status" = 'open'
		and "owner_user_id" is null
		and "answered_at" is null
		and "closed_at" is null
	) or (
		"status" = 'answered'
		and "owner_user_id" is not null
		and "answered_at" is not null
		and "closed_at" is null
	) or (
		"status" = 'closed'
		and "closed_at" is not null
	))
);
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_media_id_media_objects_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_objects"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "support_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_responses_body" CHECK (char_length(btrim("body")) between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "support_responses" ADD CONSTRAINT "support_responses_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "support_responses" ADD CONSTRAINT "support_responses_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ikiraro_close_admin_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' OR OLD.status <> 'pending' THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS admin_approvals_close ON admin_approvals;
--> statement-breakpoint
CREATE TRIGGER admin_approvals_close
BEFORE UPDATE OR DELETE ON admin_approvals
FOR EACH ROW
EXECUTE FUNCTION ikiraro_close_admin_approval();
--> statement-breakpoint
DROP TRIGGER IF EXISTS help_guides_append_only ON help_guides;
--> statement-breakpoint
CREATE TRIGGER help_guides_append_only
BEFORE UPDATE OR DELETE ON help_guides
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ikiraro_close_support_ticket()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' OR OLD.status = 'closed' THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	IF NEW.reporter_user_id IS DISTINCT FROM OLD.reporter_user_id
		OR NEW.kind IS DISTINCT FROM OLD.kind
		OR NEW.body IS DISTINCT FROM OLD.body
		OR NEW.media_id IS DISTINCT FROM OLD.media_id
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	IF OLD.status = 'answered' AND NEW.status = 'open' THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	IF OLD.answered_at IS NOT NULL AND NEW.answered_at IS DISTINCT FROM OLD.answered_at THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS support_tickets_close ON support_tickets;
--> statement-breakpoint
CREATE TRIGGER support_tickets_close
BEFORE UPDATE OR DELETE ON support_tickets
FOR EACH ROW
EXECUTE FUNCTION ikiraro_close_support_ticket();
--> statement-breakpoint
DROP TRIGGER IF EXISTS support_responses_append_only ON support_responses;
--> statement-breakpoint
CREATE TRIGGER support_responses_append_only
BEFORE UPDATE OR DELETE ON support_responses
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
