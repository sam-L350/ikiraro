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
const pointTargetSql = sql`'task', 'module', 'course'`;

/**
 * One published amount for a task, module, or course. A change inserts the
 * next version and leaves this row.
 */
export const pointRules = pgTable(
	"point_rules",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		targetType: text("target_type").notNull(),
		targetId: uuid("target_id").notNull(),
		version: integer("version").notNull(),
		points: integer("points").notNull(),
		weight: integer("weight").notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("point_rules_target_version").on(
			table.targetType,
			table.targetId,
			table.version,
		),
		check(
			"point_rules_target",
			sql`${table.targetType} in (${pointTargetSql})`,
		),
		check(
			"point_rules_points",
			sql`${table.points} >= 0 and ${table.points} <= 1000000`,
		),
		check(
			"point_rules_weight",
			sql`${table.weight} >= 1 and ${table.weight} <= 1000`,
		),
	],
);

/** The live caps are the highest version. An older version stays for the record. */
export const pointCaps = pgTable(
	"point_caps",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		version: integer("version").notNull().unique(),
		dailyCap: integer("daily_cap").notNull(),
		photoCap: integer("photo_cap").notNull(),
		fileCap: integer("file_cap").notNull(),
		noteCap: integer("note_cap").notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"point_caps_daily",
			sql`${table.dailyCap} >= 0 and ${table.dailyCap} <= 1000000`,
		),
		check(
			"point_caps_photo",
			sql`${table.photoCap} >= 0 and ${table.photoCap} <= 1000000`,
		),
		check(
			"point_caps_file",
			sql`${table.fileCap} >= 0 and ${table.fileCap} <= 1000000`,
		),
		check(
			"point_caps_note",
			sql`${table.noteCap} >= 0 and ${table.noteCap} <= 1000000`,
		),
	],
);

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
		ruleId: uuid("rule_id").references(() => pointRules.id),
		/** The amount before a daily or type cap reduced it. */
		uncappedAmount: integer("uncapped_amount"),
		/** The second admin who approved a manual adjustment. */
		approvedByUserId: integer("approved_by").references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("point_transactions_user_created").on(table.userId, table.createdAt),
		check("point_transactions_kind", sql`${table.kind} in (${pointKindSql})`),
		check(
			"point_transactions_amount",
			sql`${table.kind} in ('reversal', 'manual_adjustment') or ${table.amount} >= 0`,
		),
		check(
			"point_transactions_reference",
			sql`${table.referenceType} in ('submission', 'module', 'course', 'badge', 'adjustment')`,
		),
		check(
			"point_transactions_uncapped",
			sql`${table.uncappedAmount} is null or ${table.uncappedAmount} >= 0`,
		),
	],
);

const adjustmentStatusSql = sql`'pending', 'approved', 'rejected'`;

/**
 * A request to change a learner's points. The ledger row is written only
 * when a different admin approves it.
 */
export const pointAdjustments = pgTable(
	"point_adjustments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		learnerUserId: integer("learner_user_id")
			.notNull()
			.references(() => users.id),
		amount: integer("amount").notNull(),
		reason: text("reason").notNull(),
		requestedByUserId: integer("requested_by_user_id")
			.notNull()
			.references(() => users.id),
		status: text("status").notNull().default("pending"),
		decidedByUserId: integer("decided_by_user_id").references(() => users.id),
		decisionNote: text("decision_note"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
	},
	(table) => [
		check(
			"point_adjustments_amount",
			sql`${table.amount} <> 0 and ${table.amount} between -1000000 and 1000000`,
		),
		check(
			"point_adjustments_reason",
			sql`char_length(btrim(${table.reason})) > 0 and char_length(${table.reason}) <= 500`,
		),
		check(
			"point_adjustments_status",
			sql`${table.status} in (${adjustmentStatusSql})`,
		),
		check(
			"point_adjustments_decision",
			sql`(
				${table.status} = 'pending'
				and ${table.decidedByUserId} is null
				and ${table.decidedAt} is null
			) or (
				${table.status} <> 'pending'
				and ${table.decidedByUserId} is not null
				and ${table.decidedAt} is not null
				and ${table.decidedByUserId} <> ${table.requestedByUserId}
			)`,
		),
		check(
			"point_adjustments_reject_note",
			sql`${table.status} <> 'rejected' or (
				${table.decisionNote} is not null
				and char_length(btrim(${table.decisionNote})) > 0
			)`,
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
