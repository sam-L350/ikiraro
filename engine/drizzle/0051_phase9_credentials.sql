ALTER TABLE "badges" ADD COLUMN "valid_days" integer;
--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_valid_days" CHECK ("valid_days" is null or "valid_days" between 1 and 3650);
--> statement-breakpoint
CREATE TABLE "software_licences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"seats" integer NOT NULL,
	"expires_on" date NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "software_licences_name" CHECK (char_length(btrim("name")) between 1 and 80),
	CONSTRAINT "software_licences_seats" CHECK ("seats" between 1 and 10000)
);
--> statement-breakpoint
CREATE TABLE "software_licence_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"licence_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"granted_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "software_licence_revocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"revoked_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "software_licence_revocations_grant" ON "software_licence_revocations" USING btree ("grant_id");
--> statement-breakpoint
ALTER TABLE "software_licences" ADD CONSTRAINT "software_licences_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "software_licence_grants" ADD CONSTRAINT "software_licence_grants_licence_id_software_licences_id_fk" FOREIGN KEY ("licence_id") REFERENCES "public"."software_licences"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "software_licence_grants" ADD CONSTRAINT "software_licence_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "software_licence_grants" ADD CONSTRAINT "software_licence_grants_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "software_licence_revocations" ADD CONSTRAINT "software_licence_revocations_grant_id_software_licence_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."software_licence_grants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "software_licence_revocations" ADD CONSTRAINT "software_licence_revocations_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER IF EXISTS software_licences_append_only ON software_licences;
--> statement-breakpoint
CREATE TRIGGER software_licences_append_only
BEFORE UPDATE OR DELETE ON software_licences
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS software_licence_grants_append_only ON software_licence_grants;
--> statement-breakpoint
CREATE TRIGGER software_licence_grants_append_only
BEFORE UPDATE OR DELETE ON software_licence_grants
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS software_licence_revocations_append_only ON software_licence_revocations;
--> statement-breakpoint
CREATE TRIGGER software_licence_revocations_append_only
BEFORE UPDATE OR DELETE ON software_licence_revocations
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
