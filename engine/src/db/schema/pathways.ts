import { sql } from "drizzle-orm";
import {
	check,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { courses } from "./content";
import { users } from "./identity";

/** An ordered sequence of courses toward a goal the author named. */
export const pathways = pgTable(
	"pathways",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		titleEn: text("title_en").notNull(),
		titleRw: text("title_rw").notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"pathways_title_en",
			sql`char_length(btrim(${table.titleEn})) between 1 and 120`,
		),
		check(
			"pathways_title_rw",
			sql`char_length(btrim(${table.titleRw})) between 1 and 120`,
		),
	],
);

/** The order is the author's. Position 1 is the first course. */
export const pathwayCourses = pgTable(
	"pathway_courses",
	{
		pathwayId: uuid("pathway_id")
			.notNull()
			.references(() => pathways.id),
		courseId: uuid("course_id")
			.notNull()
			.references(() => courses.id),
		position: integer("position").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.pathwayId, table.position] }),
		uniqueIndex("pathway_courses_once").on(table.pathwayId, table.courseId),
		check("pathway_courses_position", sql`${table.position} >= 1`),
	],
);

/** One part of the short check. Position is the order it is shown. */
export const placementQuestions = pgTable(
	"placement_questions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		promptEn: text("prompt_en").notNull(),
		promptRw: text("prompt_rw").notNull(),
		position: integer("position").notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("placement_questions_position").on(table.position),
		check(
			"placement_questions_prompt_en",
			sql`char_length(btrim(${table.promptEn})) between 1 and 200`,
		),
		check(
			"placement_questions_prompt_rw",
			sql`char_length(btrim(${table.promptRw})) between 1 and 200`,
		),
	],
);

/** A visual choice. The course is what this answer suggests. */
export const placementChoices = pgTable(
	"placement_choices",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		questionId: uuid("question_id")
			.notNull()
			.references(() => placementQuestions.id),
		labelEn: text("label_en").notNull(),
		labelRw: text("label_rw").notNull(),
		courseId: uuid("course_id")
			.notNull()
			.references(() => courses.id),
		position: integer("position").notNull(),
	},
	(table) => [
		uniqueIndex("placement_choices_question_position").on(
			table.questionId,
			table.position,
		),
		check(
			"placement_choices_label_en",
			sql`char_length(btrim(${table.labelEn})) between 1 and 80`,
		),
		check(
			"placement_choices_label_rw",
			sql`char_length(btrim(${table.labelRw})) between 1 and 80`,
		),
		check("placement_choices_position", sql`${table.position} >= 1`),
	],
);

/** The choice a learner made. Older rows stay. */
export const placementAnswers = pgTable("placement_answers", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id),
	choiceId: uuid("choice_id")
		.notNull()
		.references(() => placementChoices.id),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

/** The starting course suggested by a check. The newest row is the suggestion. */
export const placementResults = pgTable("placement_results", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id),
	courseId: uuid("course_id")
		.notNull()
		.references(() => courses.id),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
