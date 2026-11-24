import { sql } from "drizzle-orm";
import {
	check,
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
import { districts } from "./geography";
import { users } from "./identity";

/** A district window. The quantity and the rules are what the coordinator wrote. */
export const allocationRounds = pgTable(
	"allocation_rounds",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		districtId: uuid("district_id")
			.notNull()
			.references(() => districts.id),
		title: text("title").notNull(),
		quantity: integer("quantity").notNull(),
		opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
		closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
		criteria: jsonb("criteria").$type<JsonValue>().notNull().default([]),
		formula: jsonb("formula").$type<JsonValue>().notNull().default({}),
		openedByUserId: integer("opened_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("allocation_rounds_district").on(table.districtId, table.opensAt),
		check(
			"allocation_rounds_title",
			sql`char_length(btrim(${table.title})) between 1 and 120`,
		),
		check(
			"allocation_rounds_quantity",
			sql`${table.quantity} between 1 and 1000`,
		),
		check(
			"allocation_rounds_window",
			sql`${table.closesAt} > ${table.opensAt}`,
		),
	],
);

/** One learner's ask. The criterion results are the ones from the moment they applied. */
export const roundApplications = pgTable(
	"round_applications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		roundId: uuid("round_id")
			.notNull()
			.references(() => allocationRounds.id),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		statement: text("statement").notNull(),
		results: jsonb("results").$type<JsonValue>().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("round_applications_learner").on(table.roundId, table.userId),
		index("round_applications_round").on(table.roundId, table.createdAt),
		check(
			"round_applications_statement",
			sql`char_length(btrim(${table.statement})) between 1 and 400`,
		),
	],
);
