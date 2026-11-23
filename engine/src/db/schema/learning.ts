import {
	integer,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { contentVersions, courses } from "./content";
import { learningCenters } from "./geography";
import { users } from "./identity";

/** A learner pinned to the published version they started. Progress is a later table. */
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
