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
import { contentVersions, courses, modules, tasks } from "./content";
import { learningCenters } from "./geography";
import { users } from "./identity";

/** A learner pinned to the published version they started. */
export const enrollments = pgTable(
	"enrollments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		courseId: uuid("course_id")
			.notNull()
			.references(() => courses.id),
		contentVersionId: uuid("content_version_id")
			.notNull()
			.references(() => contentVersions.id),
		centerId: uuid("center_id")
			.notNull()
			.references(() => learningCenters.id),
		enrolledByUserId: integer("enrolled_by_user_id").references(() => users.id),
		startedAt: timestamp("started_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("enrollments_user_course").on(table.userId, table.courseId),
	],
);

const progressSql = sql`'started', 'complete'`;

/** Reached or finished a module in the pinned version. */
export const moduleProgress = pgTable(
	"module_progress",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		enrollmentId: uuid("enrollment_id")
			.notNull()
			.references(() => enrollments.id),
		moduleId: uuid("module_id")
			.notNull()
			.references(() => modules.id),
		status: text("status").notNull(),
		startedAt: timestamp("started_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("module_progress_enrollment_module").on(
			table.enrollmentId,
			table.moduleId,
		),
		check("module_progress_status", sql`${table.status} in (${progressSql})`),
	],
);

/** Reached or finished a task in the pinned version. Approval is what completes it. */
export const taskProgress = pgTable(
	"task_progress",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		enrollmentId: uuid("enrollment_id")
			.notNull()
			.references(() => enrollments.id),
		taskId: uuid("task_id")
			.notNull()
			.references(() => tasks.id),
		status: text("status").notNull(),
		startedAt: timestamp("started_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("task_progress_enrollment_task").on(
			table.enrollmentId,
			table.taskId,
		),
		check("task_progress_status", sql`${table.status} in (${progressSql})`),
	],
);
