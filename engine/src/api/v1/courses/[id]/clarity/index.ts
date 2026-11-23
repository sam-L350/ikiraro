import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import {
	type ClarityCount,
	listCourseClarity,
} from "../../../../../core/learning/clarity";
import { db } from "../../../../../db";

/** How many learners called each task clear or too hard. */
export async function getCourseClarity(input: {
	id: string;
}): Promise<{ tasks: ClarityCount[] }> {
	await requireAuth();
	await authorize({ permission: "content.write" });
	return { tasks: await listCourseClarity(db, input.id) };
}
