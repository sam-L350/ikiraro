import { sql } from "drizzle-orm";
import {
	check,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";
import { mentorRequests } from "./mentors";

/** A message on an accepted match. The row stays for review. */
export const mentorMessages = pgTable(
	"mentor_messages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		requestId: uuid("request_id")
			.notNull()
			.references(() => mentorRequests.id),
		senderUserId: integer("sender_user_id")
			.notNull()
			.references(() => users.id),
		body: text("body").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"mentor_messages_body",
			sql`char_length(btrim(${table.body})) between 1 and 2000`,
		),
	],
);

/** A report kept with the message. It does not remove the message. */
export const mentorMessageReports = pgTable(
	"mentor_message_reports",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		messageId: uuid("message_id")
			.notNull()
			.references(() => mentorMessages.id),
		reporterUserId: integer("reporter_user_id")
			.notNull()
			.references(() => users.id),
		note: text("note").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"mentor_message_reports_note",
			sql`char_length(btrim(${table.note})) between 1 and 400`,
		),
	],
);

/** Either person can close the match. Later messages are refused. */
export const mentorBlocks = pgTable(
	"mentor_blocks",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		requestId: uuid("request_id")
			.notNull()
			.references(() => mentorRequests.id),
		blockerUserId: integer("blocker_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [unique("mentor_blocks_request").on(table.requestId)],
);

/** One side agrees to show a phone and email. Both rows are required. */
export const mentorContactShares = pgTable(
	"mentor_contact_shares",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		requestId: uuid("request_id")
			.notNull()
			.references(() => mentorRequests.id),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		unique("mentor_contact_shares_once").on(table.requestId, table.userId),
	],
);

/** An admin records the extra check before this mentor contacts a learner under 18. */
export const mentorSafeguarding = pgTable(
	"mentor_safeguarding",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		mentorUserId: integer("mentor_user_id")
			.notNull()
			.references(() => users.id),
		note: text("note").notNull(),
		checkedByUserId: integer("checked_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		unique("mentor_safeguarding_mentor").on(table.mentorUserId),
		check(
			"mentor_safeguarding_note",
			sql`char_length(btrim(${table.note})) between 1 and 400`,
		),
	],
);
