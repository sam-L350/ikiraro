import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { tasks } from "./content";
import { users } from "./identity";

const clock = sql`clock_timestamp()`;

/** Sample data for rehearsing a task. The newest row is the sample. It is not evidence. */
export const taskSamples = pgTable(
	"task_samples",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		taskId: uuid("task_id")
			.notNull()
			.references(() => tasks.id),
		titleEn: text("title_en").notNull(),
		titleRw: text("title_rw").notNull(),
		bodyEn: text("body_en").notNull(),
		bodyRw: text("body_rw").notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(clock),
	},
	(table) => [
		check(
			"task_samples_title_en",
			sql`char_length(btrim(${table.titleEn})) between 1 and 120`,
		),
		check(
			"task_samples_title_rw",
			sql`char_length(btrim(${table.titleRw})) between 1 and 120`,
		),
		check(
			"task_samples_body_en",
			sql`char_length(btrim(${table.bodyEn})) between 1 and 2000`,
		),
		check(
			"task_samples_body_rw",
			sql`char_length(btrim(${table.bodyRw})) between 1 and 2000`,
		),
	],
);

/** The sentence that says what each person must do. The newest row is the rule. */
export const taskGroupRules = pgTable(
	"task_group_rules",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		taskId: uuid("task_id")
			.notNull()
			.references(() => tasks.id),
		ruleEn: text("rule_en").notNull(),
		ruleRw: text("rule_rw").notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(clock),
	},
	(table) => [
		check(
			"task_group_rules_en",
			sql`char_length(btrim(${table.ruleEn})) between 1 and 200`,
		),
		check(
			"task_group_rules_rw",
			sql`char_length(btrim(${table.ruleRw})) between 1 and 200`,
		),
	],
);

/** A cooperative or a family working one task together. */
export const taskGroups = pgTable(
	"task_groups",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		taskId: uuid("task_id")
			.notNull()
			.references(() => tasks.id),
		kind: text("kind").notNull(),
		name: text("name").notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(clock),
	},
	(table) => [
		uniqueIndex("task_groups_creator").on(table.taskId, table.createdByUserId),
		check("task_groups_kind", sql`${table.kind} in ('cooperative', 'family')`),
		check(
			"task_groups_name",
			sql`char_length(btrim(${table.name})) between 1 and 80`,
		),
	],
);

/** Someone in the group. Credit for what they did is a later row. */
export const taskGroupMembers = pgTable(
	"task_group_members",
	{
		groupId: uuid("group_id")
			.notNull()
			.references(() => taskGroups.id),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(clock),
	},
	(table) => [primaryKey({ columns: [table.groupId, table.userId] })],
);

/** What one person did. The newest row is the credit. It does not award points. */
export const taskGroupCredits = pgTable(
	"task_group_credits",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		groupId: uuid("group_id")
			.notNull()
			.references(() => taskGroups.id),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		body: text("body").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(clock),
	},
	(table) => [
		check(
			"task_group_credits_body",
			sql`char_length(btrim(${table.body})) between 1 and 200`,
		),
	],
);

/** A learner's question on a task. */
export const taskQuestions = pgTable(
	"task_questions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		taskId: uuid("task_id")
			.notNull()
			.references(() => tasks.id),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		body: text("body").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(clock),
	},
	(table) => [
		check(
			"task_questions_body",
			sql`char_length(btrim(${table.body})) between 1 and 400`,
		),
	],
);

/** An answer. It stays hidden until a different trainer shows it. */
export const taskAnswers = pgTable(
	"task_answers",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		questionId: uuid("question_id")
			.notNull()
			.references(() => taskQuestions.id),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		body: text("body").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(clock),
	},
	(table) => [
		check(
			"task_answers_body",
			sql`char_length(btrim(${table.body})) between 1 and 400`,
		),
	],
);

/** Whether an answer is shown. The newest row wins. The author cannot decide. */
export const taskAnswerDecisions = pgTable("task_answer_decisions", {
	id: uuid("id").primaryKey().defaultRandom(),
	answerId: uuid("answer_id")
		.notNull()
		.references(() => taskAnswers.id),
	moderatorUserId: integer("moderator_user_id")
		.notNull()
		.references(() => users.id),
	shown: boolean("shown").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.default(clock),
});
