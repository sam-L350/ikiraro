import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { districts, learningCenters } from "./geography";
import { users } from "./identity";

const clock = sql`clock_timestamp()`;

/** How many quiet days count as a drop-out warning. The newest row for a district wins. */
export const warningRules = pgTable(
	"warning_rules",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		districtId: uuid("district_id")
			.notNull()
			.references(() => districts.id),
		quietDays: integer("quiet_days").notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(clock),
	},
	(table) => [
		check("warning_rules_days", sql`${table.quietDays} between 1 and 3650`),
	],
);

/** A center's waiting evidence at one moment. A higher later count is a growing backlog. */
export const backlogCounts = pgTable(
	"backlog_counts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => learningCenters.id),
		waitingCount: integer("waiting_count").notNull(),
		recordedAt: timestamp("recorded_at", { withTimezone: true })
			.notNull()
			.default(clock),
	},
	(table) => [check("backlog_counts_waiting", sql`${table.waitingCount} >= 0`)],
);

/** How often a district's donor totals are emailed. The newest row for a district wins. */
export const reportSchedules = pgTable(
	"report_schedules",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		districtId: uuid("district_id")
			.notNull()
			.references(() => districts.id),
		intervalDays: integer("interval_days").notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(clock),
	},
	(table) => [
		check(
			"report_schedules_days",
			sql`${table.intervalDays} between 1 and 366`,
		),
	],
);

/** One email run for a district. The next run waits the same number of days. */
export const reportSends = pgTable(
	"report_sends",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		districtId: uuid("district_id")
			.notNull()
			.references(() => districts.id),
		sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
		recipientCount: integer("recipient_count").notNull(),
	},
	(table) => [
		check("report_sends_recipients", sql`${table.recipientCount} >= 0`),
	],
);
