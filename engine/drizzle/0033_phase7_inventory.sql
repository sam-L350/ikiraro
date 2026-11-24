CREATE TABLE "hardware_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"serial" text NOT NULL,
	"condition" text NOT NULL,
	"status" text NOT NULL,
	"center_id" uuid NOT NULL,
	"donor" text,
	"acquired_on" date NOT NULL,
	"criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hardware_inventory_name" CHECK (char_length(btrim("name")) between 1 and 120),
	CONSTRAINT "hardware_inventory_category" CHECK (char_length(btrim("category")) between 1 and 60),
	CONSTRAINT "hardware_inventory_serial_len" CHECK (char_length(btrim("serial")) between 1 and 80),
	CONSTRAINT "hardware_inventory_condition" CHECK ("condition" in ('good', 'worn', 'damaged')),
	CONSTRAINT "hardware_inventory_status" CHECK ("status" in ('in_stock', 'reserved', 'awarded', 'in_repair', 'lost', 'retired')),
	CONSTRAINT "hardware_inventory_donor" CHECK ("donor" is null or char_length(btrim("donor")) between 1 and 120)
);--> statement-breakpoint
CREATE UNIQUE INDEX "hardware_inventory_serial" ON "hardware_inventory" USING btree ("serial");--> statement-breakpoint
CREATE INDEX "hardware_inventory_center" ON "hardware_inventory" USING btree ("center_id");--> statement-breakpoint
ALTER TABLE "hardware_inventory" ADD CONSTRAINT "hardware_inventory_center_id_learning_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."learning_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_inventory" ADD CONSTRAINT "hardware_inventory_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "hardware_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inventory_id" uuid NOT NULL,
	"status" text NOT NULL,
	"center_id" uuid NOT NULL,
	"note" text,
	"recorded_by_user_id" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hardware_status_history_status" CHECK ("status" in ('in_stock', 'reserved', 'awarded', 'in_repair', 'lost', 'retired')),
	CONSTRAINT "hardware_status_history_note" CHECK ("note" is null or char_length(btrim("note")) between 1 and 200)
);--> statement-breakpoint
CREATE INDEX "hardware_status_history_item" ON "hardware_status_history" USING btree ("inventory_id", "recorded_at");--> statement-breakpoint
ALTER TABLE "hardware_status_history" ADD CONSTRAINT "hardware_status_history_inventory_id_hardware_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."hardware_inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_status_history" ADD CONSTRAINT "hardware_status_history_center_id_learning_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."learning_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_status_history" ADD CONSTRAINT "hardware_status_history_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP TRIGGER IF EXISTS hardware_status_history_append_only ON hardware_status_history;--> statement-breakpoint
CREATE TRIGGER hardware_status_history_append_only
BEFORE UPDATE OR DELETE ON hardware_status_history
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
