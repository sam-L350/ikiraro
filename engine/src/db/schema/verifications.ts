import { sql } from "drizzle-orm";
import {
	check,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { rubricCriteria } from "./content";
import { users } from "./identity";
import { taskSubmissions } from "./submissions";

const decisionSql = sql`'approved', 'needs_revision', 'rejected'`;
const reasonSql = sql`'not_the_task', 'not_the_learner', 'unreadable', 'incomplete'`;

/**
 * One decision for one attempt. The row is never edited. Approval is written
 * with the award in phase 4.6, so this phase only inserts the other two.
 */
export const submissionVerifications = pgTable(
	"submission_verifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		submissionId: uuid("submission_id")
			.notNull()
			.references(() => taskSubmissions.id),
		reviewerUserId: integer("reviewer_user_id")
			.notNull()
			.references(() => users.id),
		decision: text("decision").notNull(),
		note: text("note").notNull(),
		reasonCode: text("reason_code"),
		scoreTotal: integer("score_total"),
		decidedAt: timestamp("decided_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("submission_verifications_submission").on(table.submissionId),
		check(
			"submission_verifications_decision",
			sql`${table.decision} in (${decisionSql})`,
		),
		check(
			"submission_verifications_reason",
			sql`${table.reasonCode} is null or ${table.reasonCode} in (${reasonSql})`,
		),
		check(
			"submission_verifications_reason_required",
			sql`(
				${table.decision} = 'rejected' and ${table.reasonCode} is not null
			) or (
				${table.decision} <> 'rejected' and ${table.reasonCode} is null
			)`,
		),
		check(
			"submission_verifications_note",
			sql`char_length(btrim(${table.note})) > 0`,
		),
		check(
			"submission_verifications_score",
			sql`${table.scoreTotal} is null or ${table.scoreTotal} between 0 and 100`,
		),
	],
);

/** One score for one rubric row. Insert-only, like the decision it belongs to. */
export const verificationScores = pgTable(
	"verification_scores",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		verificationId: uuid("verification_id")
			.notNull()
			.references(() => submissionVerifications.id),
		criterionId: uuid("criterion_id")
			.notNull()
			.references(() => rubricCriteria.id),
		score: integer("score").notNull(),
	},
	(table) => [
		uniqueIndex("verification_scores_criterion").on(
			table.verificationId,
			table.criterionId,
		),
		check("verification_scores_range", sql`${table.score} between 0 and 100`),
	],
);
