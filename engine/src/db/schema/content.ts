import { sql } from "drizzle-orm";
import {
	check,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import type { JsonValue } from "./compliance";
import { users } from "./identity";

/** Working-copy lifecycle. A published pin lives in content_versions, not in these rows. */
export const CONTENT_STATUSES = [
	"draft",
	"in_review",
	"published",
	"retired",
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_LOCALES = ["rw", "en"] as const;

export type ContentLocale = (typeof CONTENT_LOCALES)[number];

const statusSql = sql`'draft', 'in_review', 'published', 'retired'`;

export const courses = pgTable(
	"courses",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		status: text("status").notNull().default("draft"),
		createdByUserId: integer("created_by_user_id").references(() => users.id),
		publishedAt: timestamp("published_at", { withTimezone: true }),
		retiredAt: timestamp("retired_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [check("courses_status", sql`${table.status} in (${statusSql})`)],
);

export const courseTranslations = pgTable(
	"course_translations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		courseId: uuid("course_id")
			.notNull()
			.references(() => courses.id),
		locale: text("locale").notNull(),
		title: text("title").notNull(),
		summary: text("summary"),
	},
	(table) => [
		uniqueIndex("course_translations_course_locale").on(
			table.courseId,
			table.locale,
		),
		check("course_translations_locale", sql`${table.locale} in ('rw', 'en')`),
	],
);

export const modules = pgTable(
	"modules",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		courseId: uuid("course_id")
			.notNull()
			.references(() => courses.id),
		position: integer("position").notNull().default(0),
		status: text("status").notNull().default("draft"),
		retiredAt: timestamp("retired_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("modules_course_position").on(table.courseId, table.position),
		check("modules_status", sql`${table.status} in (${statusSql})`),
	],
);

export const moduleTranslations = pgTable(
	"module_translations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		moduleId: uuid("module_id")
			.notNull()
			.references(() => modules.id),
		locale: text("locale").notNull(),
		title: text("title").notNull(),
		summary: text("summary"),
	},
	(table) => [
		uniqueIndex("module_translations_module_locale").on(
			table.moduleId,
			table.locale,
		),
		check("module_translations_locale", sql`${table.locale} in ('rw', 'en')`),
	],
);

export const tasks = pgTable(
	"tasks",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		moduleId: uuid("module_id")
			.notNull()
			.references(() => modules.id),
		position: integer("position").notNull().default(0),
		status: text("status").notNull().default("draft"),
		/** Required before a course can be sent for review. Empty while the draft is still being written. */
		evidenceType: text("evidence_type"),
		retiredAt: timestamp("retired_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("tasks_module_position").on(table.moduleId, table.position),
		check("tasks_status", sql`${table.status} in (${statusSql})`),
	],
);

export const taskTranslations = pgTable(
	"task_translations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		taskId: uuid("task_id")
			.notNull()
			.references(() => tasks.id),
		locale: text("locale").notNull(),
		title: text("title").notNull(),
		instructions: text("instructions"),
	},
	(table) => [
		uniqueIndex("task_translations_task_locale").on(table.taskId, table.locale),
		check("task_translations_locale", sql`${table.locale} in ('rw', 'en')`),
	],
);

/** Weighted scoring rows. Prompts are stored in both languages on the criterion. */
export const rubricCriteria = pgTable(
	"rubric_criteria",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		taskId: uuid("task_id")
			.notNull()
			.references(() => tasks.id),
		position: integer("position").notNull().default(0),
		weight: integer("weight").notNull(),
		promptRw: text("prompt_rw"),
		promptEn: text("prompt_en"),
	},
	(table) => [
		uniqueIndex("rubric_criteria_task_position").on(
			table.taskId,
			table.position,
		),
		check("rubric_criteria_weight", sql`${table.weight} > 0`),
	],
);

export const badges = pgTable("badges", {
	id: uuid("id").primaryKey().defaultRandom(),
	courseId: uuid("course_id")
		.notNull()
		.references(() => courses.id),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

/** Immutable published snapshot. Later enrollment pins this row. */
export const contentVersions = pgTable(
	"content_versions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		courseId: uuid("course_id")
			.notNull()
			.references(() => courses.id),
		versionNumber: integer("version_number").notNull(),
		snapshot: jsonb("snapshot").$type<JsonValue>().notNull(),
		publishedByUserId: integer("published_by_user_id").references(
			() => users.id,
		),
		publishedAt: timestamp("published_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("content_versions_course_number").on(
			table.courseId,
			table.versionNumber,
		),
		check("content_versions_number", sql`${table.versionNumber} > 0`),
	],
);
