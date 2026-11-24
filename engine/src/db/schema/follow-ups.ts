import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	date,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { hardwareGrants } from "./grants";
import { users } from "./identity";
import { mediaObjects } from "./media";

/** One check-in at 30, 90, or 180 days after the award. */
export const followUps = pgTable(
	"follow_ups",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		grantId: uuid("grant_id")
			.notNull()
			.references(() => hardwareGrants.id),
		day: integer("day").notNull(),
		dueOn: date("due_on").notNull(),
		askedAt: timestamp("asked_at", { withTimezone: true }),
		inUse: boolean("in_use"),
		purpose: text("purpose"),
		answeredAt: timestamp("answered_at", { withTimezone: true }),
		response: text("response").notNull().default("waiting"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("follow_ups_grant_day").on(table.grantId, table.day),
		check("follow_ups_day", sql`${table.day} in (30, 90, 180)`),
		check(
			"follow_ups_response",
			sql`${table.response} in ('waiting', 'answered', 'unresponsive')`,
		),
		check(
			"follow_ups_answer",
			sql`(
				${table.response} = 'waiting'
				and ${table.inUse} is null
				and ${table.purpose} is null
				and ${table.answeredAt} is null
			) or (
				${table.response} = 'answered'
				and ${table.answeredAt} is not null
				and (
					(${table.inUse} = true and ${table.purpose} is not null and char_length(btrim(${table.purpose})) between 1 and 400)
					or (${table.inUse} = false and ${table.purpose} is null)
				)
			) or (
				${table.response} = 'unresponsive'
				and ${table.askedAt} is not null
				and ${table.inUse} is null
				and ${table.purpose} is null
				and ${table.answeredAt} is null
			)`,
		),
	],
);

/** A photo of real use. A send-back allows another row, like a task attempt. */
export const followUpEvidence = pgTable(
	"follow_up_evidence",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		followUpId: uuid("follow_up_id")
			.notNull()
			.references(() => followUps.id),
		mediaObjectId: uuid("media_object_id")
			.notNull()
			.references(() => mediaObjects.id),
		note: text("note").notNull(),
		status: text("status").notNull().default("pending"),
		submittedByUserId: integer("submitted_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"follow_up_evidence_status",
			sql`${table.status} in ('pending', 'approved', 'needs_revision', 'rejected')`,
		),
		check(
			"follow_up_evidence_note",
			sql`char_length(btrim(${table.note})) between 1 and 400`,
		),
	],
);

/** The trainer's decision. The row is not edited. */
export const followUpVerifications = pgTable(
	"follow_up_verifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		evidenceId: uuid("evidence_id")
			.notNull()
			.references(() => followUpEvidence.id),
		reviewerUserId: integer("reviewer_user_id")
			.notNull()
			.references(() => users.id),
		decision: text("decision").notNull(),
		note: text("note").notNull(),
		decidedAt: timestamp("decided_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("follow_up_verifications_evidence").on(table.evidenceId),
		check(
			"follow_up_verifications_decision",
			sql`${table.decision} in ('approved', 'needs_revision', 'rejected')`,
		),
		check(
			"follow_up_verifications_note",
			sql`char_length(btrim(${table.note})) between 1 and 400`,
		),
	],
);

/** Opened when a check-in was asked and still unanswered at the next one. */
export const followUpReviews = pgTable(
	"follow_up_reviews",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		followUpId: uuid("follow_up_id")
			.notNull()
			.references(() => followUps.id),
		openedAt: timestamp("opened_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		closedAt: timestamp("closed_at", { withTimezone: true }),
		closedByUserId: integer("closed_by_user_id").references(() => users.id),
		note: text("note"),
	},
	(table) => [
		uniqueIndex("follow_up_reviews_follow_up").on(table.followUpId),
		check(
			"follow_up_reviews_close",
			sql`(
				${table.closedAt} is null
				and ${table.closedByUserId} is null
				and ${table.note} is null
			) or (
				${table.closedAt} is not null
				and ${table.closedByUserId} is not null
				and ${table.note} is not null
				and char_length(btrim(${table.note})) between 1 and 400
			)`,
		),
	],
);
