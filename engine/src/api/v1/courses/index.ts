import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import type { CourseSummary } from "../../../core/content/author";
import { listCourses } from "../../../core/content/author";
import { db } from "../../../db";

/** Courses an author can open and edit. */
export async function getCourses(): Promise<{ courses: CourseSummary[] }> {
	await requireAuth();
	await authorize({ permission: "content.write" });
	return { courses: await listCourses(db) };
}
