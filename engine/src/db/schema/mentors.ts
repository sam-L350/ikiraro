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
import { districts } from "./geography";
import { users } from "./identity";

/** An admin approves a mentor or a partner before they can reach a learner. */
export const mentors = pgTable(
	"mentors",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		kind: text("kind").notNull(),
		weeklyContactCap: integer("weekly_contact_cap").notNull(),
		status: text("status").notNull().default("pending"),
		note: text("note"),
		decidedByUserId: integer("decided_by_user_id").references(() => users.id),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("mentors_one_open")
			.on(table.userId)
			.where(sql`${table.status} in ('pending', 'approved')`),
		check("mentors_kind", sql`${table.kind} in ('mentor', 'partner')`),
		check("mentors_cap", sql`${table.weeklyContactCap} between 0 and 10000`),
		check(
			"mentors_status",
			sql`${table.status} in ('pending', 'approved', 'declined')`,
		),
		check(
			"mentors_decision",
			sql`(
				${table.status} = 'pending' and ${table.decidedAt} is null and ${table.note} is null
			) or (
				${table.status} = 'approved' and ${table.decidedAt} is not null and ${table.decidedByUserId} is not null and ${table.note} is null
			) or (
				${table.status} = 'declined' and ${table.decidedAt} is not null and ${table.decidedByUserId} is not null and ${table.note} is not null and char_length(btrim(${table.note})) between 1 and 400
			)`,
		),
	],
);

/** A learner chooses the skill and district a mentor may see. */
export const mentorOptIns = pgTable(
	"mentor_opt_ins",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		skill: text("skill").notNull(),
		districtId: uuid("district_id")
			.notNull()
			.references(() => districts.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("mentor_opt_ins_choice").on(
			table.userId,
			table.skill,
			table.districtId,
		),
		check(
			"mentor_opt_ins_skill",
			sql`char_length(btrim(${table.skill})) between 1 and 80`,
		),
	],
);

/** A mentor asks, and the learner accepts or declines. The row then freezes. */
export const mentorRequests = pgTable(
	"mentor_requests",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		mentorId: uuid("mentor_id")
			.notNull()
			.references(() => mentors.id),
		optInId: uuid("opt_in_id")
			.notNull()
			.references(() => mentorOptIns.id),
		learnerUserId: integer("learner_user_id")
			.notNull()
			.references(() => users.id),
		status: text("status").notNull().default("pending"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("mentor_requests_one_pending")
			.on(table.mentorId, table.learnerUserId)
			.where(sql`${table.status} = 'pending'`),
		check(
			"mentor_requests_status",
			sql`${table.status} in ('pending', 'accepted', 'declined')`,
		),
		check(
			"mentor_requests_decision",
			sql`(
				${table.status} = 'pending' and ${table.decidedAt} is null
			) or (
				${table.status} <> 'pending' and ${table.decidedAt} is not null
			)`,
		),
	],
);
