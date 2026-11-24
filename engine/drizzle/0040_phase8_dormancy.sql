CREATE TABLE "dormancy_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follow_up_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"recipient_user_id" integer NOT NULL,
	"district_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dormancy_alerts_reason" CHECK ("reason" in ('unanswered', 'not_practicing'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dormancy_alerts_follow_up_reason" ON "dormancy_alerts" USING btree ("follow_up_id","reason");
--> statement-breakpoint
ALTER TABLE "dormancy_alerts" ADD CONSTRAINT "dormancy_alerts_follow_up_id_follow_ups_id_fk" FOREIGN KEY ("follow_up_id") REFERENCES "public"."follow_ups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dormancy_alerts" ADD CONSTRAINT "dormancy_alerts_grant_id_hardware_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."hardware_grants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dormancy_alerts" ADD CONSTRAINT "dormancy_alerts_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "dormancy_alerts" ADD CONSTRAINT "dormancy_alerts_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER IF EXISTS dormancy_alerts_append_only ON dormancy_alerts;
--> statement-breakpoint
CREATE TRIGGER dormancy_alerts_append_only
BEFORE UPDATE OR DELETE ON dormancy_alerts
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
