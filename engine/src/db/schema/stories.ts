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
import { mediaObjects } from "./media";

/**
 * A story a learner wrote for partners. A later row replaces it in the report.
 * Older rows stay. The report still requires the latest success-story consent.
 */
export const successStories = pgTable(
	"success_stories",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		body: text("body").notNull(),
		mediaId: uuid("media_id")
			.notNull()
			.references(() => mediaObjects.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"success_stories_body",
			sql`char_length(btrim(${table.body})) between 1 and 800`,
		),
	],
);
