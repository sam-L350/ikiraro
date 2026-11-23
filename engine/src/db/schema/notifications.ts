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
import { domainEvents } from "./compliance";
import { users } from "./identity";

const channelSql = sql`'in_app', 'sms', 'email'`;
const statusSql = sql`'queued', 'sent', 'failed'`;

/** A sentence an admin can change without a deploy. One row per event, channel, and language. */
export const notificationTemplates = pgTable(
	"notification_templates",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		eventName: text("event_name").notNull(),
		channel: text("channel").notNull(),
		locale: text("locale").notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		updatedByUserId: integer("updated_by_user_id").references(() => users.id),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("notification_templates_slot").on(
			table.eventName,
			table.channel,
			table.locale,
		),
		check(
			"notification_templates_channel",
			sql`${table.channel} in (${channelSql})`,
		),
		check(
			"notification_templates_locale",
			sql`${table.locale} in ('rw', 'en')`,
		),
		check(
			"notification_templates_title",
			sql`char_length(btrim(${table.title})) > 0 and char_length(${table.title}) <= 120`,
		),
		check(
			"notification_templates_body",
			sql`char_length(btrim(${table.body})) > 0 and char_length(${table.body}) <= 500`,
		),
	],
);

/** A person's choice for one event and one channel. A missing row uses the default. */
export const notificationPreferences = pgTable(
	"notification_preferences",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		eventName: text("event_name").notNull(),
		channel: text("channel").notNull(),
		enabled: boolean("enabled").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("notification_preferences_slot").on(
			table.userId,
			table.eventName,
			table.channel,
		),
		check(
			"notification_preferences_channel",
			sql`${table.channel} in (${channelSql})`,
		),
	],
);

/**
 * One delivery attempt. In-app rows are the inbox. SMS and email stay queued
 * until a sender accepts them, so a failure is visible instead of dropped.
 */
export const notifications = pgTable(
	"notifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		eventId: uuid("event_id").references(() => domainEvents.id),
		eventName: text("event_name").notNull(),
		channel: text("channel").notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		status: text("status").notNull().default("queued"),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		sentAt: timestamp("sent_at", { withTimezone: true }),
		readAt: timestamp("read_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("notifications_event_user_channel").on(
			table.eventId,
			table.userId,
			table.channel,
			table.eventName,
		),
		check("notifications_channel", sql`${table.channel} in (${channelSql})`),
		check("notifications_status", sql`${table.status} in (${statusSql})`),
		check("notifications_attempts", sql`${table.attempts} >= 0`),
	],
);
