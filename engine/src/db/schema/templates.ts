import { sql } from "drizzle-orm";
import {
	check,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

/** A task an author can copy into a new draft. The copy is the course, not this row. */
export const contentTemplates = pgTable(
	"content_templates",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		titleEn: text("title_en").notNull(),
		titleRw: text("title_rw"),
		instructionsEn: text("instructions_en"),
		instructionsRw: text("instructions_rw"),
		evidenceType: text("evidence_type"),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`clock_timestamp()`),
	},
	(table) => [
		check(
			"content_templates_name",
			sql`char_length(btrim(${table.name})) between 1 and 80`,
		),
		check(
			"content_templates_title_en",
			sql`char_length(btrim(${table.titleEn})) between 1 and 120`,
		),
		check(
			"content_templates_title_rw",
			sql`${table.titleRw} is null or char_length(btrim(${table.titleRw})) between 1 and 120`,
		),
		check(
			"content_templates_instructions_en",
			sql`${table.instructionsEn} is null or char_length(${table.instructionsEn}) <= 2000`,
		),
		check(
			"content_templates_instructions_rw",
			sql`${table.instructionsRw} is null or char_length(${table.instructionsRw}) <= 2000`,
		),
		check(
			"content_templates_evidence",
			sql`${table.evidenceType} is null or ${table.evidenceType} in ('photo', 'file', 'note')`,
		),
	],
);
