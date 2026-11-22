import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import type { CourseView } from "../../../../core/content/author";
import { readCourse } from "../../../../core/content/author";
import { db } from "../../../../db";

/** One course with its modules, tasks, and rubric, in both languages. */
export async function getCourse(input: { id: string }): Promise<CourseView> {
	await requireAuth();
	await authorize({ permission: "content.write" });
	return readCourse(db, input.id);
}
