import { sql } from "drizzle-orm";
import {
	check,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import type { JsonValue } from "./compliance";
import { users } from "./identity";
import { hardwareInventory } from "./inventory";
import { allocationRounds, roundApplications } from "./rounds";

/** The ranked list at the moment it was written. A later ranking adds a row. */
export const rankingSnapshots = pgTable(
	"ranking_snapshots",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		roundId: uuid("round_id")
			.notNull()
			.references(() => allocationRounds.id),
		body: jsonb("body").$type<JsonValue>().notNull(),
		recordedByUserId: integer("recorded_by_user_id")
			.notNull()
			.references(() => users.id),
		recordedAt: timestamp("recorded_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("ranking_snapshots_round").on(table.roundId, table.recordedAt),
	],
);

/** Who decided, and why. The row is not edited. */
export const committeeDecisions = pgTable(
	"committee_decisions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		roundId: uuid("round_id")
			.notNull()
			.references(() => allocationRounds.id),
		applicationId: uuid("application_id")
			.notNull()
			.references(() => roundApplications.id),
		snapshotId: uuid("snapshot_id")
			.notNull()
			.references(() => rankingSnapshots.id),
		decision: text("decision").notNull(),
		reason: text("reason").notNull(),
		decidedByUserId: integer("decided_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("committee_decisions_application").on(table.applicationId),
		index("committee_decisions_round").on(table.roundId, table.createdAt),
		check(
			"committee_decisions_decision",
			sql`${table.decision} in ('awarded', 'declined')`,
		),
		check(
			"committee_decisions_reason",
			sql`char_length(btrim(${table.reason})) between 1 and 400`,
		),
	],
);

/** The item, the recipient, and the decision that awarded it. */
export const hardwareGrants = pgTable(
	"hardware_grants",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		decisionId: uuid("decision_id")
			.notNull()
			.references(() => committeeDecisions.id),
		roundId: uuid("round_id")
			.notNull()
			.references(() => allocationRounds.id),
		applicationId: uuid("application_id")
			.notNull()
			.references(() => roundApplications.id),
		inventoryId: uuid("inventory_id")
			.notNull()
			.references(() => hardwareInventory.id),
		recipientUserId: integer("recipient_user_id")
			.notNull()
			.references(() => users.id),
		approvedByUserId: integer("approved_by_user_id")
			.notNull()
			.references(() => users.id),
		status: text("status").notNull().default("active"),
		awardedOn: date("awarded_on").notNull().defaultNow(),
		handoverConfirmedAt: timestamp("handover_confirmed_at", {
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("hardware_grants_decision").on(table.decisionId),
		uniqueIndex("hardware_grants_application").on(table.applicationId),
		uniqueIndex("hardware_grants_active_item")
			.on(table.inventoryId)
			.where(sql`${table.status} = 'active'`),
		index("hardware_grants_round").on(table.roundId),
		check(
			"hardware_grants_status",
			sql`${table.status} in ('active', 'recovered', 'transferred')`,
		),
	],
);
