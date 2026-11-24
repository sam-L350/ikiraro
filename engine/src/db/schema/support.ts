import { sql } from "drizzle-orm";
import {
	check,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import type { JsonValue } from "./compliance";
import { users } from "./identity";
import { mediaObjects } from "./media";

/**
 * A role change waiting for a different admin.
 * Point adjustments and grant exceptions keep their own tables.
 */
export const adminApprovals = pgTable(
	"admin_approvals",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		kind: text("kind").notNull().default("role_change"),
		reason: text("reason").notNull(),
		changes: jsonb("changes").$type<JsonValue>().notNull(),
		requestedByUserId: integer("requested_by_user_id")
			.notNull()
			.references(() => users.id),
		decidedByUserId: integer("decided_by_user_id").references(() => users.id),
		status: text("status").notNull().default("pending"),
		decisionNote: text("decision_note"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
	},
	(table) => [
		check("admin_approvals_kind", sql`${table.kind} = 'role_change'`),
		check(
			"admin_approvals_reason",
			sql`char_length(btrim(${table.reason})) between 1 and 400`,
		),
		check(
			"admin_approvals_status",
			sql`${table.status} in ('pending', 'approved', 'declined')`,
		),
		check(
			"admin_approvals_decision",
			sql`(
				${table.status} = 'pending'
				and ${table.decidedByUserId} is null
				and ${table.decisionNote} is null
				and ${table.decidedAt} is null
			) or (
				${table.status} = 'approved'
				and ${table.decidedByUserId} is not null
				and ${table.decidedByUserId} <> ${table.requestedByUserId}
				and ${table.decisionNote} is null
				and ${table.decidedAt} is not null
			) or (
				${table.status} = 'declined'
				and ${table.decidedByUserId} is not null
				and ${table.decidedByUserId} <> ${table.requestedByUserId}
				and ${table.decisionNote} is not null
				and char_length(btrim(${table.decisionNote})) between 1 and 400
				and ${table.decidedAt} is not null
			)`,
		),
	],
);

/** A searchable guide. A walkthrough is audio or video already stored as media. */
export const helpGuides = pgTable(
	"help_guides",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		titleEn: text("title_en").notNull(),
		titleRw: text("title_rw").notNull(),
		bodyEn: text("body_en").notNull(),
		bodyRw: text("body_rw").notNull(),
		walkthrough: text("walkthrough"),
		mediaId: uuid("media_id").references(() => mediaObjects.id),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"help_guides_title_en",
			sql`char_length(btrim(${table.titleEn})) between 1 and 200`,
		),
		check(
			"help_guides_title_rw",
			sql`char_length(btrim(${table.titleRw})) between 1 and 200`,
		),
		check(
			"help_guides_body_en",
			sql`char_length(btrim(${table.bodyEn})) between 1 and 4000`,
		),
		check(
			"help_guides_body_rw",
			sql`char_length(btrim(${table.bodyRw})) between 1 and 4000`,
		),
		check(
			"help_guides_walkthrough",
			sql`(
				${table.walkthrough} is null and ${table.mediaId} is null
			) or (
				${table.walkthrough} in ('audio', 'video') and ${table.mediaId} is not null
			)`,
		),
	],
);

/** A problem report. The kind chooses who may answer it. */
export const supportTickets = pgTable(
	"support_tickets",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		reporterUserId: integer("reporter_user_id")
			.notNull()
			.references(() => users.id),
		kind: text("kind").notNull(),
		body: text("body").notNull(),
		mediaId: uuid("media_id").references(() => mediaObjects.id),
		status: text("status").notNull().default("open"),
		ownerUserId: integer("owner_user_id").references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		answeredAt: timestamp("answered_at", { withTimezone: true }),
		closedAt: timestamp("closed_at", { withTimezone: true }),
	},
	(table) => [
		check(
			"support_tickets_kind",
			sql`${table.kind} in ('technical', 'content', 'conduct')`,
		),
		check(
			"support_tickets_body",
			sql`char_length(btrim(${table.body})) between 1 and 4000`,
		),
		check(
			"support_tickets_status",
			sql`${table.status} in ('open', 'answered', 'closed')`,
		),
		check(
			"support_tickets_times",
			sql`(
				${table.status} = 'open'
				and ${table.ownerUserId} is null
				and ${table.answeredAt} is null
				and ${table.closedAt} is null
			) or (
				${table.status} = 'answered'
				and ${table.ownerUserId} is not null
				and ${table.answeredAt} is not null
				and ${table.closedAt} is null
			) or (
				${table.status} = 'closed'
				and ${table.closedAt} is not null
			)`,
		),
	],
);

/** A note on a ticket. The row is never edited. */
export const supportResponses = pgTable(
	"support_responses",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		ticketId: uuid("ticket_id")
			.notNull()
			.references(() => supportTickets.id),
		authorUserId: integer("author_user_id")
			.notNull()
			.references(() => users.id),
		body: text("body").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"support_responses_body",
			sql`char_length(btrim(${table.body})) between 1 and 2000`,
		),
	],
);
