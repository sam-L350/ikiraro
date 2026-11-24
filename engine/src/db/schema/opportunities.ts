import { sql } from "drizzle-orm";
import {
	check,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

/** A job, apprenticeship, contract, or training post from an approved partner. */
export const opportunities = pgTable(
	"opportunities",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		partnerUserId: integer("partner_user_id")
			.notNull()
			.references(() => users.id),
		kind: text("kind").notNull(),
		title: text("title").notNull(),
		skill: text("skill").notNull(),
		body: text("body").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"opportunities_kind",
			sql`${table.kind} in ('job', 'apprenticeship', 'contract', 'training')`,
		),
		check(
			"opportunities_title",
			sql`char_length(btrim(${table.title})) between 1 and 80`,
		),
		check(
			"opportunities_skill",
			sql`char_length(btrim(${table.skill})) between 1 and 120`,
		),
		check(
			"opportunities_body",
			sql`char_length(btrim(${table.body})) between 1 and 400`,
		),
	],
);

/** A trainer or coordinator recommends a learner. It stays off the passport until the learner allows it. */
export const referrals = pgTable(
	"referrals",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		learnerUserId: integer("learner_user_id")
			.notNull()
			.references(() => users.id),
		authorUserId: integer("author_user_id")
			.notNull()
			.references(() => users.id),
		note: text("note").notNull(),
		shownAt: timestamp("shown_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"referrals_note",
			sql`char_length(btrim(${table.note})) between 1 and 400`,
		),
	],
);
