CREATE TABLE "success_stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"body" text NOT NULL,
	"media_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "success_stories_body" CHECK (char_length(btrim("body")) between 1 and 800)
);
--> statement-breakpoint
ALTER TABLE "success_stories" ADD CONSTRAINT "success_stories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "success_stories" ADD CONSTRAINT "success_stories_media_id_media_objects_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_objects"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER IF EXISTS success_stories_append_only ON success_stories;
--> statement-breakpoint
CREATE TRIGGER success_stories_append_only
BEFORE UPDATE OR DELETE ON success_stories
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
