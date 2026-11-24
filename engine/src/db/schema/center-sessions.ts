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
import { courses } from "./content";
import { learningCenters } from "./geography";
import { users } from "./identity";

/**
 * A scheduled meeting at a learning center. This is not the login session table.
 * The check-in token is a public code, never the row id.
 */
export const centerSessions = pgTable(
	"center_sessions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => learningCenters.id),
		courseId: uuid("course_id").references(() => courses.id),
		topic: text("topic").notNull(),
		trainerUserId: integer("trainer_user_id")
			.notNull()
			.references(() => users.id),
		startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
		minutes: integer("minutes").notNull(),
		capacity: integer("capacity").notNull(),
		checkInToken: text("check_in_token").notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("center_sessions_token").on(table.checkInToken),
		index("center_sessions_center_start").on(table.centerId, table.startsAt),
		check(
			"center_sessions_topic",
			sql`char_length(btrim(${table.topic})) between 1 and 120`,
		),
		check("center_sessions_minutes", sql`${table.minutes} between 15 and 480`),
		check("center_sessions_capacity", sql`${table.capacity} between 1 and 500`),
	],
);

/** One mark per learner per session. The id comes from the client so a retry is the same row. */
export const sessionAttendance = pgTable(
	"session_attendance",
	{
		id: uuid("id").primaryKey(),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => centerSessions.id),
		learnerUserId: integer("learner_user_id")
			.notNull()
			.references(() => users.id),
		method: text("method").notNull(),
		minutes: integer("minutes").notNull(),
		markedByUserId: integer("marked_by_user_id")
			.notNull()
			.references(() => users.id),
		markedAt: timestamp("marked_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("session_attendance_once").on(
			table.sessionId,
			table.learnerUserId,
		),
		index("session_attendance_learner").on(table.learnerUserId),
		check("session_attendance_method", sql`${table.method} in ('tick', 'qr')`),
		check(
			"session_attendance_minutes",
			sql`${table.minutes} between 15 and 480`,
		),
	],
);
