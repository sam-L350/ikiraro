import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { hardwareGrants } from "./grants";
import { users } from "./identity";

/** Why an item came back, and who recorded it. The row is not edited. */
export const hardwareRecoveries = pgTable(
	"hardware_recoveries",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		grantId: uuid("grant_id")
			.notNull()
			.references(() => hardwareGrants.id),
		situation: text("situation").notNull(),
		reason: text("reason").notNull(),
		recordedByUserId: integer("recorded_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("hardware_recoveries_grant").on(table.grantId),
		check(
			"hardware_recoveries_situation",
			sql`${table.situation} in ('unused', 'lost', 'misused')`,
		),
		check(
			"hardware_recoveries_reason",
			sql`char_length(btrim(${table.reason})) between 1 and 400`,
		),
	],
);

/**
 * A request to set a grant rule aside. A second person approves it.
 * An approved row is public and is not edited again.
 */
export const grantExceptions = pgTable(
	"grant_exceptions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		grantId: uuid("grant_id")
			.notNull()
			.references(() => hardwareGrants.id),
		reason: text("reason").notNull(),
		requestedByUserId: integer("requested_by_user_id")
			.notNull()
			.references(() => users.id),
		decidedByUserId: integer("decided_by_user_id").references(() => users.id),
		status: text("status").notNull().default("pending"),
		publicSummary: boolean("public_summary").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("grant_exceptions_pending")
			.on(table.grantId)
			.where(sql`${table.status} = 'pending'`),
		check(
			"grant_exceptions_status",
			sql`${table.status} in ('pending', 'approved', 'rejected')`,
		),
		check(
			"grant_exceptions_reason",
			sql`char_length(btrim(${table.reason})) between 1 and 400`,
		),
		check(
			"grant_exceptions_public",
			sql`(
				${table.status} = 'pending'
				and ${table.decidedByUserId} is null
				and ${table.publicSummary} = false
				and ${table.decidedAt} is null
			) or (
				${table.status} = 'approved'
				and ${table.decidedByUserId} is not null
				and ${table.decidedByUserId} <> ${table.requestedByUserId}
				and ${table.publicSummary} = true
				and ${table.decidedAt} is not null
			) or (
				${table.status} = 'rejected'
				and ${table.decidedByUserId} is not null
				and ${table.decidedByUserId} <> ${table.requestedByUserId}
				and ${table.publicSummary} = false
				and ${table.decidedAt} is not null
			)`,
		),
	],
);
