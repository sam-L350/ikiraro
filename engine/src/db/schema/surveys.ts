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

/** A baseline at registration, or a later endline. Answers are not rewritten. */
export const outcomeSurveys = pgTable(
	"outcome_surveys",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		kind: text("kind").notNull(),
		digitalConfidence: integer("digital_confidence").notNull(),
		tasksDigital: integer("tasks_digital").notNull(),
		income: integer("income").notNull(),
		services: text("services").notNull(),
		jobsOrCustomers: integer("jobs_or_customers").notNull(),
		recordedAt: timestamp("recorded_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		verifiedAt: timestamp("verified_at", { withTimezone: true }),
		verifiedByUserId: integer("verified_by_user_id").references(() => users.id),
		verificationNote: text("verification_note"),
	},
	(table) => [
		uniqueIndex("outcome_surveys_user_kind").on(table.userId, table.kind),
		check(
			"outcome_surveys_kind",
			sql`${table.kind} in ('baseline', 'endline')`,
		),
		check(
			"outcome_surveys_confidence",
			sql`${table.digitalConfidence} between 0 and 10`,
		),
		check(
			"outcome_surveys_tasks",
			sql`${table.tasksDigital} between 0 and 100000`,
		),
		check(
			"outcome_surveys_income",
			sql`${table.income} between 0 and 1000000000`,
		),
		check(
			"outcome_surveys_jobs",
			sql`${table.jobsOrCustomers} between 0 and 100000`,
		),
		check(
			"outcome_surveys_services",
			sql`char_length(btrim(${table.services})) between 1 and 400`,
		),
		check(
			"outcome_surveys_verified",
			sql`(
				${table.verifiedAt} is null
				and ${table.verifiedByUserId} is null
				and ${table.verificationNote} is null
			) or (
				${table.verifiedAt} is not null
				and ${table.verifiedByUserId} is not null
				and ${table.verifiedByUserId} <> ${table.userId}
				and ${table.verificationNote} is not null
				and char_length(btrim(${table.verificationNote})) between 1 and 400
			)`,
		),
	],
);
