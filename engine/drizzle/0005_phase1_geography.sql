CREATE TABLE "center_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"province_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	CONSTRAINT "districts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "learning_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sector_id" uuid NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provinces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	CONSTRAINT "provinces_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"district_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	CONSTRAINT "sectors_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "center_id" uuid;--> statement-breakpoint
ALTER TABLE "center_staff" ADD CONSTRAINT "center_staff_center_id_learning_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."learning_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "center_staff" ADD CONSTRAINT "center_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_province_id_provinces_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."provinces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_centers" ADD CONSTRAINT "learning_centers_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "center_staff_member_role" ON "center_staff" USING btree ("center_id","user_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "center_staff_one_manager" ON "center_staff" USING btree ("center_id") WHERE "center_staff"."role" = 'center_manager';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_center_id_learning_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."learning_centers"("id") ON DELETE no action ON UPDATE no action;