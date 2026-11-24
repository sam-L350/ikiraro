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

/** A sign-in failure count that survives a restart. The subject is the guard key, not a secret. */
export const loginLocks = pgTable(
	"login_locks",
	{
		subject: text("subject").primaryKey(),
		failures: integer("failures").notNull().default(0),
		resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
		lockedUntil: timestamp("locked_until", { withTimezone: true }),
	},
	(table) => [
		check("login_locks_failures", sql`${table.failures} >= 0`),
		check(
			"login_locks_subject_not_blank",
			sql`char_length(${table.subject}) between 1 and 400`,
		),
	],
);

/** An optional authenticator secret for a staff account. The secret is never returned after it is confirmed. */
export const staffFactors = pgTable(
	"staff_factors",
	{
		userId: integer("user_id")
			.primaryKey()
			.references(() => users.id),
		secret: text("secret").notNull(),
		confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"staff_factors_secret",
			sql`char_length(${table.secret}) between 16 and 64`,
		),
	],
);

/**
 * A proposal to close one account into another.
 * A different admin decides. The request itself can change status.
 */
export const accountMergeRequests = pgTable(
	"account_merge_requests",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		keepUserId: integer("keep_user_id")
			.notNull()
			.references(() => users.id),
		dropUserId: integer("drop_user_id")
			.notNull()
			.references(() => users.id),
		reason: text("reason").notNull(),
		requestedByUserId: integer("requested_by_user_id")
			.notNull()
			.references(() => users.id),
		decidedByUserId: integer("decided_by_user_id").references(() => users.id),
		status: text("status").notNull().default("pending"),
		decisionNote: text("decision_note"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("account_merge_requests_pending")
			.on(table.keepUserId, table.dropUserId)
			.where(sql`${table.status} = 'pending'`),
		check(
			"account_merge_requests_pair",
			sql`${table.keepUserId} <> ${table.dropUserId}`,
		),
		check(
			"account_merge_requests_reason",
			sql`char_length(btrim(${table.reason})) between 1 and 400`,
		),
		check(
			"account_merge_requests_status",
			sql`${table.status} in ('pending', 'approved', 'declined')`,
		),
		check(
			"account_merge_requests_decision",
			sql`(
				${table.status} = 'pending'
				and ${table.decidedByUserId} is null
				and ${table.decisionNote} is null
				and ${table.decidedAt} is null
			) or (
				${table.status} = 'approved'
				and ${table.decidedByUserId} is not null
				and ${table.decidedByUserId} <> ${table.requestedByUserId}
				and ${table.decisionNote} is null
				and ${table.decidedAt} is not null
			) or (
				${table.status} = 'declined'
				and ${table.decidedByUserId} is not null
				and ${table.decidedByUserId} <> ${table.requestedByUserId}
				and ${table.decisionNote} is not null
				and char_length(btrim(${table.decisionNote})) between 1 and 400
				and ${table.decidedAt} is not null
			)`,
		),
	],
);

/** The completed merge. The row is fixed when it is stored. */
export const accountMerges = pgTable("account_merges", {
	id: uuid("id").primaryKey().defaultRandom(),
	requestId: uuid("request_id")
		.notNull()
		.unique()
		.references(() => accountMergeRequests.id),
	keepUserId: integer("keep_user_id")
		.notNull()
		.references(() => users.id),
	dropUserId: integer("drop_user_id")
		.notNull()
		.references(() => users.id),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

/** How many days a photo stays. Zero means the photo stays. Newest row wins. */
export const retentionPolicies = pgTable(
	"retention_policies",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		evidenceDays: integer("evidence_days").notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"retention_policies_days",
			sql`${table.evidenceDays} between 0 and 3650`,
		),
	],
);
