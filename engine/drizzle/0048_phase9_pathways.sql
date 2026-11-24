CREATE TABLE "pathways" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_en" text NOT NULL,
	"title_rw" text NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pathways_title_en" CHECK (char_length(btrim("title_en")) between 1 and 120),
	CONSTRAINT "pathways_title_rw" CHECK (char_length(btrim("title_rw")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "pathway_courses" (
	"pathway_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "pathway_courses_pathway_id_position_pk" PRIMARY KEY("pathway_id","position"),
	CONSTRAINT "pathway_courses_position" CHECK ("position" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pathway_courses_once" ON "pathway_courses" USING btree ("pathway_id","course_id");
--> statement-breakpoint
CREATE TABLE "placement_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_en" text NOT NULL,
	"prompt_rw" text NOT NULL,
	"position" integer NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placement_questions_prompt_en" CHECK (char_length(btrim("prompt_en")) between 1 and 200),
	CONSTRAINT "placement_questions_prompt_rw" CHECK (char_length(btrim("prompt_rw")) between 1 and 200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "placement_questions_position" ON "placement_questions" USING btree ("position");
--> statement-breakpoint
CREATE TABLE "placement_choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"label_en" text NOT NULL,
	"label_rw" text NOT NULL,
	"course_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "placement_choices_label_en" CHECK (char_length(btrim("label_en")) between 1 and 80),
	CONSTRAINT "placement_choices_label_rw" CHECK (char_length(btrim("label_rw")) between 1 and 80),
	CONSTRAINT "placement_choices_position" CHECK ("position" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "placement_choices_question_position" ON "placement_choices" USING btree ("question_id","position");
--> statement-breakpoint
CREATE TABLE "placement_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"choice_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placement_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"course_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pathways" ADD CONSTRAINT "pathways_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pathway_courses" ADD CONSTRAINT "pathway_courses_pathway_id_pathways_id_fk" FOREIGN KEY ("pathway_id") REFERENCES "public"."pathways"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pathway_courses" ADD CONSTRAINT "pathway_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "placement_questions" ADD CONSTRAINT "placement_questions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "placement_choices" ADD CONSTRAINT "placement_choices_question_id_placement_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."placement_questions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "placement_choices" ADD CONSTRAINT "placement_choices_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "placement_answers" ADD CONSTRAINT "placement_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "placement_answers" ADD CONSTRAINT "placement_answers_choice_id_placement_choices_id_fk" FOREIGN KEY ("choice_id") REFERENCES "public"."placement_choices"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "placement_results" ADD CONSTRAINT "placement_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "placement_results" ADD CONSTRAINT "placement_results_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER IF EXISTS placement_answers_append_only ON placement_answers;
--> statement-breakpoint
CREATE TRIGGER placement_answers_append_only
BEFORE UPDATE OR DELETE ON placement_answers
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS placement_results_append_only ON placement_results;
--> statement-breakpoint
CREATE TRIGGER placement_results_append_only
BEFORE UPDATE OR DELETE ON placement_results
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
