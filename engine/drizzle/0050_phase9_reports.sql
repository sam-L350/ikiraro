CREATE TABLE "warning_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"district_id" uuid NOT NULL,
	"quiet_days" integer NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "warning_rules_days" CHECK ("quiet_days" between 1 and 3650)
);
--> statement-breakpoint
CREATE TABLE "backlog_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"waiting_count" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "backlog_counts_waiting" CHECK ("waiting_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "report_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"district_id" uuid NOT NULL,
	"interval_days" integer NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "report_schedules_days" CHECK ("interval_days" between 1 and 366)
);
--> statement-breakpoint
CREATE TABLE "report_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"district_id" uuid NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"recipient_count" integer NOT NULL,
	CONSTRAINT "report_sends_recipients" CHECK ("recipient_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "warning_rules" ADD CONSTRAINT "warning_rules_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "warning_rules" ADD CONSTRAINT "warning_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "backlog_counts" ADD CONSTRAINT "backlog_counts_center_id_learning_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."learning_centers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "report_sends" ADD CONSTRAINT "report_sends_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER IF EXISTS warning_rules_append_only ON warning_rules;
--> statement-breakpoint
CREATE TRIGGER warning_rules_append_only
BEFORE UPDATE OR DELETE ON warning_rules
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS backlog_counts_append_only ON backlog_counts;
--> statement-breakpoint
CREATE TRIGGER backlog_counts_append_only
BEFORE UPDATE OR DELETE ON backlog_counts
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS report_schedules_append_only ON report_schedules;
--> statement-breakpoint
CREATE TRIGGER report_schedules_append_only
BEFORE UPDATE OR DELETE ON report_schedules
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS report_sends_append_only ON report_sends;
--> statement-breakpoint
CREATE TRIGGER report_sends_append_only
BEFORE UPDATE OR DELETE ON report_sends
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
