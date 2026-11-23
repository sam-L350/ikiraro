import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { badges } from "./content";
import { users } from "./identity";
import { enrollments } from "./learning";
import { submissionVerifications } from "./verifications";

const pointKindSql = sql`'task_approved', 'module_completed', 'course_completed', 'streak_bonus', 'community_contribution', 'manual_adjustment', 'reversal'`;

/**
 * One ledger line. The balance is the sum. A reversal is a later row, never
 * an edit of this one.
 */
export const pointTransactions = pgTable(
	"point_transactions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		amount: integer("amount").notNull(),
		kind: text("kind").notNull(),
		referenceType: text("reference_type").notNull(),
		referenceId: text("reference_id").notNull(),
		verificationId: uuid("verification_id").references(
			() => submissionVerifications.id,
		),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("point_transactions_user_created").on(table.userId, table.createdAt),
		check("point_transactions_kind", sql`${table.kind} in (${pointKindSql})`),
		check(
			"point_transactions_amount",
			sql`${table.kind} = 'reversal' or ${table.amount} >= 0`,
		),
		check(
			"point_transactions_reference",
			sql`${table.referenceType} in ('submission', 'module', 'course', 'badge', 'adjustment')`,
		),
	],
);

const badgeEntrySql = sql`'awarded', 'revoked'`;

/** A badge grant. Taking it back inserts a revoked row and leaves this one. */
export const earnedBadges = pgTable(
	"earned_badges",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		badgeId: uuid("badge_id")
			.notNull()
			.references(() => badges.id),
		enrollmentId: uuid("enrollment_id")
			.notNull()
			.references(() => enrollments.id),
		verificationId: uuid("verification_id")
			.notNull()
			.references(() => submissionVerifications.id),
		entry: text("entry").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("earned_badges_user_badge_entry").on(
			table.userId,
			table.badgeId,
			table.entry,
		),
		check("earned_badges_entry", sql`${table.entry} in (${badgeEntrySql})`),
	],
);
