import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
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
 * One decision for one attempt. The row is never edited. Approval is inserted
 * by `award_submission`, in the same database call as the points and the badge.
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

/** A later reversal. The verification row it points at is never edited. */
export const verificationRevocations = pgTable(
	"verification_revocations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		verificationId: uuid("verification_id")
			.notNull()
			.unique()
			.references(() => submissionVerifications.id),
		actorUserId: integer("actor_user_id")
			.notNull()
			.references(() => users.id),
		reason: text("reason").notNull(),
		suspendReviewer: boolean("suspend_reviewer").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"verification_revocations_reason",
			sql`char_length(btrim(${table.reason})) > 0`,
		),
	],
);

/**
 * A second reading of an approval. The verification it points at is never
 * edited, and a disagreement does not take the points back.
 */
export const secondReviews = pgTable(
	"second_reviews",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		verificationId: uuid("verification_id")
			.notNull()
			.references(() => submissionVerifications.id),
		submissionId: uuid("submission_id")
			.notNull()
			.references(() => taskSubmissions.id),
		firstReviewerUserId: integer("first_reviewer_user_id")
			.notNull()
			.references(() => users.id),
		secondReviewerUserId: integer("second_reviewer_user_id").references(
			() => users.id,
		),
		status: text("status").notNull().default("open"),
		note: text("note"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("second_reviews_verification").on(table.verificationId),
		index("second_reviews_waiting")
			.on(table.createdAt)
			.where(sql`${table.status} = 'open'`),
		check(
			"second_reviews_status",
			sql`${table.status} in ('open', 'agreed', 'disagreed')`,
		),
		check(
			"second_reviews_shape",
			sql`(
				${table.status} = 'open'
				and ${table.secondReviewerUserId} is null
				and ${table.note} is null
				and ${table.decidedAt} is null
			) or (
				${table.status} in ('agreed', 'disagreed')
				and ${table.secondReviewerUserId} is not null
				and ${table.secondReviewerUserId} <> ${table.firstReviewerUserId}
				and ${table.note} is not null
				and char_length(btrim(${table.note})) between 1 and 500
				and ${table.decidedAt} is not null
			)`,
		),
	],
);
