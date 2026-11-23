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
import { users } from "./identity";
import { taskSubmissions } from "./submissions";
import { submissionVerifications } from "./verifications";

/**
 * One ask per rejection. The verification row stays as it was. Overturned
 * means the learner may try again.
 */
export const appeals = pgTable(
	"appeals",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		submissionId: uuid("submission_id")
			.notNull()
			.references(() => taskSubmissions.id),
		verificationId: uuid("verification_id")
			.notNull()
			.references(() => submissionVerifications.id),
		learnerUserId: integer("learner_user_id")
			.notNull()
			.references(() => users.id),
		firstReviewerUserId: integer("first_reviewer_user_id")
			.notNull()
			.references(() => users.id),
		note: text("note").notNull(),
		status: text("status").notNull().default("open"),
		decisionNote: text("decision_note"),
		decidedByUserId: integer("decided_by_user_id").references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("appeals_submission").on(table.submissionId),
		uniqueIndex("appeals_verification").on(table.verificationId),
		check(
			"appeals_status",
			sql`${table.status} in ('open', 'upheld', 'overturned')`,
		),
		check(
			"appeals_note",
			sql`char_length(btrim(${table.note})) between 1 and 500`,
		),
		check(
			"appeals_shape",
			sql`(
				${table.status} = 'open'
				and ${table.decidedByUserId} is null
				and ${table.decisionNote} is null
				and ${table.decidedAt} is null
			) or (
				${table.status} in ('upheld', 'overturned')
				and ${table.decidedByUserId} is not null
				and ${table.decidedByUserId} <> ${table.firstReviewerUserId}
				and ${table.decidedByUserId} <> ${table.learnerUserId}
				and ${table.decisionNote} is not null
				and char_length(btrim(${table.decisionNote})) between 1 and 500
				and ${table.decidedAt} is not null
			)`,
		),
	],
);

/** A short line a trainer can drop into feedback and then change. */
export const feedbackSnippets = pgTable(
	"feedback_snippets",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		locale: text("locale").notNull(),
		body: text("body").notNull(),
		createdByUserId: integer("created_by_user_id").references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check("feedback_snippets_locale", sql`${table.locale} in ('rw', 'en')`),
		check(
			"feedback_snippets_body",
			sql`char_length(btrim(${table.body})) between 1 and 280`,
		),
	],
);
