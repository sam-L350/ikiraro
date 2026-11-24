import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { learningCenters } from "./geography";
import { users } from "./identity";

/** A temporary place. People come back to the home center after the session. */
export const popupTours = pgTable(
	"popup_tours",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		place: text("place").notNull(),
		homeCenterId: uuid("home_center_id")
			.notNull()
			.references(() => learningCenters.id),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`clock_timestamp()`),
	},
	(table) => [
		index("popup_tours_center").on(table.homeCenterId),
		check(
			"popup_tours_place",
			sql`char_length(btrim(${table.place})) between 1 and 120`,
		),
	],
);

/** One meeting at a pop-up. The place and the home center stay on the tour. */
export const popupSessions = pgTable(
	"popup_sessions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		tourId: uuid("tour_id")
			.notNull()
			.references(() => popupTours.id),
		topic: text("topic").notNull(),
		startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
		minutes: integer("minutes").notNull(),
		capacity: integer("capacity").notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`clock_timestamp()`),
	},
	(table) => [
		index("popup_sessions_tour").on(table.tourId, table.startsAt),
		check(
			"popup_sessions_topic",
			sql`char_length(btrim(${table.topic})) between 1 and 120`,
		),
		check("popup_sessions_minutes", sql`${table.minutes} between 15 and 480`),
		check("popup_sessions_capacity", sql`${table.capacity} between 1 and 500`),
	],
);

/** A learner takes one place on a session. */
export const popupSignups = pgTable(
	"popup_signups",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => popupSessions.id),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`clock_timestamp()`),
	},
	(table) => [
		uniqueIndex("popup_signups_once").on(table.sessionId, table.userId),
	],
);

/** Attendance stays. It does not remove the signup. */
export const popupAttendance = pgTable(
	"popup_attendance",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => popupSessions.id),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		markedByUserId: integer("marked_by_user_id")
			.notNull()
			.references(() => users.id),
		markedAt: timestamp("marked_at", { withTimezone: true })
			.notNull()
			.default(sql`clock_timestamp()`),
	},
	(table) => [
		uniqueIndex("popup_attendance_once").on(table.sessionId, table.userId),
	],
);

/** The person now uses the tour's home center. */
export const popupHomeLinks = pgTable(
	"popup_home_links",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		tourId: uuid("tour_id")
			.notNull()
			.references(() => popupTours.id),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		centerId: uuid("center_id")
			.notNull()
			.references(() => learningCenters.id),
		linkedByUserId: integer("linked_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`clock_timestamp()`),
	},
	(table) => [
		uniqueIndex("popup_home_links_once").on(table.tourId, table.userId),
	],
);
