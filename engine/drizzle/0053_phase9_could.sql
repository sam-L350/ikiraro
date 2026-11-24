ALTER TABLE "task_submissions" DROP CONSTRAINT "task_submissions_evidence";
--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_evidence" CHECK ("evidence_type" in ('photo', 'file', 'note', 'voice'));
--> statement-breakpoint
ALTER TABLE "content_templates" DROP CONSTRAINT "content_templates_evidence";
--> statement-breakpoint
ALTER TABLE "content_templates" ADD CONSTRAINT "content_templates_evidence" CHECK ("evidence_type" is null or "evidence_type" in ('photo', 'file', 'note', 'voice'));
--> statement-breakpoint
CREATE TABLE "voice_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "voice_transcripts_body" CHECK (char_length(btrim("body")) between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "showcase_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"submission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "satisfaction_pulses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"moment" text NOT NULL,
	"verification_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "satisfaction_pulses_moment" CHECK ("moment" in ('first_badge', 'review')),
	CONSTRAINT "satisfaction_pulses_moment_target" CHECK ((
		"moment" = 'first_badge' and "verification_id" is null
	) or (
		"moment" = 'review' and "verification_id" is not null
	)),
	CONSTRAINT "satisfaction_pulses_body" CHECK (char_length(btrim("body")) between 1 and 280)
);
--> statement-breakpoint
CREATE TABLE "item_repairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_id" uuid NOT NULL,
	"note" text NOT NULL,
	"recorded_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "item_repairs_note" CHECK (char_length(btrim("note")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "item_warranties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_id" uuid NOT NULL,
	"ends_on" date NOT NULL,
	"recorded_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"event" text NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "partner_webhooks_url" CHECK (char_length(btrim("url")) between 8 and 200),
	CONSTRAINT "partner_webhooks_event" CHECK ("event" in ('credential.awarded', 'grant.decided'))
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event" text NOT NULL,
	"target_id" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "webhook_deliveries_event" CHECK ("event" in ('credential.awarded', 'grant.decided')),
	CONSTRAINT "webhook_deliveries_target" CHECK (char_length(btrim("target_id")) between 1 and 80),
	CONSTRAINT "webhook_deliveries_attempts" CHECK ("attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "voice_transcripts_submission" ON "voice_transcripts" USING btree ("submission_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "showcase_pins_once" ON "showcase_pins" USING btree ("user_id","submission_id");
--> statement-breakpoint
CREATE INDEX "showcase_pins_user" ON "showcase_pins" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "satisfaction_pulses_first_badge" ON "satisfaction_pulses" USING btree ("user_id") WHERE "moment" = 'first_badge';
--> statement-breakpoint
CREATE UNIQUE INDEX "satisfaction_pulses_review" ON "satisfaction_pulses" USING btree ("user_id","verification_id") WHERE "moment" = 'review';
--> statement-breakpoint
CREATE INDEX "item_repairs_item" ON "item_repairs" USING btree ("inventory_id","created_at");
--> statement-breakpoint
CREATE INDEX "item_warranties_item" ON "item_warranties" USING btree ("inventory_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "partner_webhooks_url_event" ON "partner_webhooks" USING btree ("url","event");
--> statement-breakpoint
CREATE INDEX "webhook_deliveries_unsent" ON "webhook_deliveries" USING btree ("created_at");
--> statement-breakpoint
ALTER TABLE "voice_transcripts" ADD CONSTRAINT "voice_transcripts_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "voice_transcripts" ADD CONSTRAINT "voice_transcripts_author_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "showcase_pins" ADD CONSTRAINT "showcase_pins_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "showcase_pins" ADD CONSTRAINT "showcase_pins_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."task_submissions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "satisfaction_pulses" ADD CONSTRAINT "satisfaction_pulses_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "satisfaction_pulses" ADD CONSTRAINT "satisfaction_pulses_verification_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."submission_verifications"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "item_repairs" ADD CONSTRAINT "item_repairs_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."hardware_inventory"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "item_repairs" ADD CONSTRAINT "item_repairs_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "item_warranties" ADD CONSTRAINT "item_warranties_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."hardware_inventory"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "item_warranties" ADD CONSTRAINT "item_warranties_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "partner_webhooks" ADD CONSTRAINT "partner_webhooks_created_by_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."partner_webhooks"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER IF EXISTS voice_transcripts_append_only ON voice_transcripts;
--> statement-breakpoint
CREATE TRIGGER voice_transcripts_append_only
BEFORE UPDATE OR DELETE ON voice_transcripts
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS showcase_pins_append_only ON showcase_pins;
--> statement-breakpoint
CREATE TRIGGER showcase_pins_append_only
BEFORE UPDATE OR DELETE ON showcase_pins
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS satisfaction_pulses_append_only ON satisfaction_pulses;
--> statement-breakpoint
CREATE TRIGGER satisfaction_pulses_append_only
BEFORE UPDATE OR DELETE ON satisfaction_pulses
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS item_repairs_append_only ON item_repairs;
--> statement-breakpoint
CREATE TRIGGER item_repairs_append_only
BEFORE UPDATE OR DELETE ON item_repairs
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS item_warranties_append_only ON item_warranties;
--> statement-breakpoint
CREATE TRIGGER item_warranties_append_only
BEFORE UPDATE OR DELETE ON item_warranties
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS partner_webhooks_append_only ON partner_webhooks;
--> statement-breakpoint
CREATE TRIGGER partner_webhooks_append_only
BEFORE UPDATE OR DELETE ON partner_webhooks
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
