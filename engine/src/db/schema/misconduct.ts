import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { learningCenters } from "./geography";
import { users } from "./identity";

const kindSql = sql`'misconduct', 'bribery', 'favoritism'`;
const statusSql = sql`'open', 'closed'`;

/**
 * A confidential concern. Staff of the accused center have no permission
 * on the row. A reviewer must work outside the reporter's centers.
 */
export const misconductReports = pgTable(
	"reports_misconduct",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		reporterUserId: integer("reporter_user_id")
			.notNull()
			.references(() => users.id),
		reporterCenterId: uuid("reporter_center_id")
			.notNull()
			.references(() => learningCenters.id),
		accusedCenterId: uuid("accused_center_id")
			.notNull()
			.references(() => learningCenters.id),
		kind: text("kind").notNull(),
		body: text("body").notNull(),
		status: text("status").notNull().default("open"),
		closedNote: text("closed_note"),
		closedByUserId: integer("closed_by_user_id").references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		closedAt: timestamp("closed_at", { withTimezone: true }),
	},
	(table) => [
		index("reports_misconduct_reporter").on(table.reporterUserId),
		index("reports_misconduct_accused").on(table.accusedCenterId, table.status),
		check("reports_misconduct_kind", sql`${table.kind} in (${kindSql})`),
		check("reports_misconduct_status", sql`${table.status} in (${statusSql})`),
		check(
			"reports_misconduct_body",
			sql`char_length(btrim(${table.body})) between 1 and 2000`,
		),
		check(
			"reports_misconduct_closed",
			sql`(
				${table.status} = 'open'
				and ${table.closedNote} is null
				and ${table.closedByUserId} is null
				and ${table.closedAt} is null
			) or (
				${table.status} = 'closed'
				and ${table.closedNote} is not null
				and char_length(btrim(${table.closedNote})) between 1 and 500
				and ${table.closedByUserId} is not null
				and ${table.closedAt} is not null
			)`,
		),
	],
);
