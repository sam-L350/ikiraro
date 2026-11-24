ALTER TABLE "hardware_inventory" ADD COLUMN "current_holder_user_id" integer;--> statement-breakpoint
ALTER TABLE "hardware_inventory" ADD CONSTRAINT "hardware_inventory_current_holder_user_id_users_id_fk" FOREIGN KEY ("current_holder_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_status_history" ADD COLUMN "holder_user_id" integer;--> statement-breakpoint
ALTER TABLE "hardware_status_history" ADD CONSTRAINT "hardware_status_history_holder_user_id_users_id_fk" FOREIGN KEY ("holder_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "handover_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"inventory_id" uuid NOT NULL,
	"recipient_user_id" integer NOT NULL,
	"witness_user_id" integer NOT NULL,
	"acknowledgment" text NOT NULL,
	"signature_media_id" uuid,
	"otp_challenge_id" uuid,
	"photo_media_id" uuid NOT NULL,
	"form" jsonb NOT NULL,
	"recorded_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handover_records_ack" CHECK ("acknowledgment" in ('signature', 'otp')),
	CONSTRAINT "handover_records_signature" CHECK ((
		"acknowledgment" = 'signature'
		and "signature_media_id" is not null
		and "otp_challenge_id" is null
	) or (
		"acknowledgment" = 'otp'
		and "otp_challenge_id" is not null
		and "signature_media_id" is null
	)),
	CONSTRAINT "handover_records_photo" CHECK ("photo_media_id" is distinct from "signature_media_id"),
	CONSTRAINT "handover_records_witness" CHECK ("witness_user_id" <> "recipient_user_id" and "witness_user_id" <> "recorded_by_user_id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "handover_records_grant" ON "handover_records" USING btree ("grant_id");--> statement-breakpoint
ALTER TABLE "handover_records" ADD CONSTRAINT "handover_records_grant_id_hardware_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."hardware_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_records" ADD CONSTRAINT "handover_records_inventory_id_hardware_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."hardware_inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_records" ADD CONSTRAINT "handover_records_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_records" ADD CONSTRAINT "handover_records_witness_user_id_users_id_fk" FOREIGN KEY ("witness_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_records" ADD CONSTRAINT "handover_records_signature_media_id_media_objects_id_fk" FOREIGN KEY ("signature_media_id") REFERENCES "public"."media_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_records" ADD CONSTRAINT "handover_records_otp_challenge_id_otp_challenges_id_fk" FOREIGN KEY ("otp_challenge_id") REFERENCES "public"."otp_challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_records" ADD CONSTRAINT "handover_records_photo_media_id_media_objects_id_fk" FOREIGN KEY ("photo_media_id") REFERENCES "public"."media_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_records" ADD CONSTRAINT "handover_records_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP TRIGGER IF EXISTS handover_records_append_only ON handover_records;--> statement-breakpoint
CREATE TRIGGER handover_records_append_only
BEFORE UPDATE OR DELETE ON handover_records
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
