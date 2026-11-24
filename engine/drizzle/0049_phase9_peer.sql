CREATE TABLE "task_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"title_en" text NOT NULL,
	"title_rw" text NOT NULL,
	"body_en" text NOT NULL,
	"body_rw" text NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "task_samples_title_en" CHECK (char_length(btrim("title_en")) between 1 and 120),
	CONSTRAINT "task_samples_title_rw" CHECK (char_length(btrim("title_rw")) between 1 and 120),
	CONSTRAINT "task_samples_body_en" CHECK (char_length(btrim("body_en")) between 1 and 2000),
	CONSTRAINT "task_samples_body_rw" CHECK (char_length(btrim("body_rw")) between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "task_group_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"rule_en" text NOT NULL,
	"rule_rw" text NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "task_group_rules_en" CHECK (char_length(btrim("rule_en")) between 1 and 200),
	CONSTRAINT "task_group_rules_rw" CHECK (char_length(btrim("rule_rw")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "task_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "task_groups_kind" CHECK ("kind" in ('cooperative', 'family')),
	CONSTRAINT "task_groups_name" CHECK (char_length(btrim("name")) between 1 and 80)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "task_groups_creator" ON "task_groups" USING btree ("task_id","created_by_user_id");
--> statement-breakpoint
CREATE TABLE "task_group_members" (
	"group_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "task_group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "task_group_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "task_group_credits_body" CHECK (char_length(btrim("body")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "task_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "task_questions_body" CHECK (char_length(btrim("body")) between 1 and 400)
);
--> statement-breakpoint
CREATE TABLE "task_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "task_answers_body" CHECK (char_length(btrim("body")) between 1 and 400)
);
--> statement-breakpoint
CREATE TABLE "task_answer_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"answer_id" uuid NOT NULL,
	"moderator_user_id" integer NOT NULL,
	"shown" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_samples" ADD CONSTRAINT "task_samples_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_samples" ADD CONSTRAINT "task_samples_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_group_rules" ADD CONSTRAINT "task_group_rules_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_group_rules" ADD CONSTRAINT "task_group_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_groups" ADD CONSTRAINT "task_groups_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_groups" ADD CONSTRAINT "task_groups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_group_members" ADD CONSTRAINT "task_group_members_group_id_task_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."task_groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_group_members" ADD CONSTRAINT "task_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_group_credits" ADD CONSTRAINT "task_group_credits_group_id_task_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."task_groups"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_group_credits" ADD CONSTRAINT "task_group_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_questions" ADD CONSTRAINT "task_questions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_questions" ADD CONSTRAINT "task_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_answers" ADD CONSTRAINT "task_answers_question_id_task_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."task_questions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_answers" ADD CONSTRAINT "task_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_answer_decisions" ADD CONSTRAINT "task_answer_decisions_answer_id_task_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."task_answers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_answer_decisions" ADD CONSTRAINT "task_answer_decisions_moderator_user_id_users_id_fk" FOREIGN KEY ("moderator_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER IF EXISTS task_samples_append_only ON task_samples;
--> statement-breakpoint
CREATE TRIGGER task_samples_append_only
BEFORE UPDATE OR DELETE ON task_samples
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS task_group_rules_append_only ON task_group_rules;
--> statement-breakpoint
CREATE TRIGGER task_group_rules_append_only
BEFORE UPDATE OR DELETE ON task_group_rules
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS task_group_credits_append_only ON task_group_credits;
--> statement-breakpoint
CREATE TRIGGER task_group_credits_append_only
BEFORE UPDATE OR DELETE ON task_group_credits
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS task_questions_append_only ON task_questions;
--> statement-breakpoint
CREATE TRIGGER task_questions_append_only
BEFORE UPDATE OR DELETE ON task_questions
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS task_answers_append_only ON task_answers;
--> statement-breakpoint
CREATE TRIGGER task_answers_append_only
BEFORE UPDATE OR DELETE ON task_answers
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS task_answer_decisions_append_only ON task_answer_decisions;
--> statement-breakpoint
CREATE TRIGGER task_answer_decisions_append_only
BEFORE UPDATE OR DELETE ON task_answer_decisions
FOR EACH ROW
EXECUTE FUNCTION ikiraro_reject_mutation();
