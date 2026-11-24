ALTER TABLE "hardware_grants" ADD COLUMN "conditions" text;--> statement-breakpoint
ALTER TABLE "hardware_grants" ADD COLUMN "conditions_agreed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hardware_grants" ADD CONSTRAINT "hardware_grants_conditions" CHECK ("conditions" is null or char_length(btrim("conditions")) between 1 and 800);--> statement-breakpoint
CREATE TABLE "hardware_recoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"situation" text NOT NULL,
	"reason" text NOT NULL,
	"recorded_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hardware_recoveries_situation" CHECK ("situation" in ('unused', 'lost', 'misused')),
	CONSTRAINT "hardware_recoveries_reason" CHECK (char_length(btrim("reason")) between 1 and 400)
);--> statement-breakpoint
CREATE UNIQUE INDEX "hardware_recoveries_grant" ON "hardware_recoveries" USING btree ("grant_id");--> statement-breakpoint
ALTER TABLE "hardware_recoveries" ADD CONSTRAINT "hardware_recoveries_grant_id_hardware_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."hardware_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_recoveries" ADD CONSTRAINT "hardware_recoveries_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "grant_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"requested_by_user_id" integer NOT NULL,
	"decided_by_user_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"public_summary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "grant_exceptions_status" CHECK ("status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "grant_exceptions_reason" CHECK (char_length(btrim("reason")) between 1 and 400),
	CONSTRAINT "grant_exceptions_public" CHECK ((
		"status" = 'pending'
		and "decided_by_user_id" is null
		and "public_summary" = false
		and "decided_at" is null
	) or (
		"status" = 'approved'
		and "decided_by_user_id" is not null
		and "decided_by_user_id" <> "requested_by_user_id"
		and "public_summary" = true
		and "decided_at" is not null
	) or (
		"status" = 'rejected'
		and "decided_by_user_id" is not null
		and "decided_by_user_id" <> "requested_by_user_id"
		and "public_summary" = false
		and "decided_at" is not null
	))
);--> statement-breakpoint
CREATE UNIQUE INDEX "grant_exceptions_pending" ON "grant_exceptions" USING btree ("grant_id") WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "grant_exceptions" ADD CONSTRAINT "grant_exceptions_grant_id_hardware_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."hardware_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_exceptions" ADD CONSTRAINT "grant_exceptions_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grant_exceptions" ADD CONSTRAINT "grant_exceptions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP TRIGGER IF EXISTS hardware_recoveries_append_only ON hardware_recoveries;--> statement-breakpoint
CREATE TRIGGER hardware_recoveries_append_only
BEFORE UPDATE OR DELETE ON hardware_recoveries
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();--> statement-breakpoint
CREATE OR REPLACE FUNCTION ikiraro_close_grant_exception()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' OR OLD.status <> 'pending' THEN
		RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME;
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS grant_exceptions_close ON grant_exceptions;--> statement-breakpoint
CREATE TRIGGER grant_exceptions_close
BEFORE UPDATE OR DELETE ON grant_exceptions
FOR EACH ROW
EXECUTE FUNCTION ikiraro_close_grant_exception();
