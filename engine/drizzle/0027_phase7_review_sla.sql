ALTER TABLE "task_submissions" ADD COLUMN "review_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD COLUMN "escalation" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_escalation" CHECK ("escalation" in ('none', 'manager', 'district'));--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_review_due" CHECK (
	("status" = 'draft' and "review_due_at" is null and "escalation" = 'none')
	or "status" <> 'draft'
);--> statement-breakpoint
UPDATE "task_submissions"
SET "review_due_at" = "submitted_at" + interval '72 hours'
WHERE "review_due_at" is null
	and "submitted_at" is not null
	and "status" in ('pending', 'in_review');--> statement-breakpoint
CREATE INDEX "task_submissions_review_due_idx" ON "task_submissions" USING btree ("review_due_at") WHERE "status" in ('pending', 'in_review');--> statement-breakpoint
INSERT INTO "config_settings" ("key", "value", "version")
SELECT 'review.sla_ms', '259200000'::jsonb, 1
WHERE NOT EXISTS (
	SELECT 1 FROM "config_settings" WHERE "key" = 'review.sla_ms'
);
