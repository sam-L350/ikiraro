import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import type { CourseView } from "../../../../../core/content/author";
import { submitCourseForReview } from "../../../../../core/content/author";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Send a complete draft to review. Evidence type and a rubric are required. */
export async function createCourseReview(input: {
	id: string;
}): Promise<CourseView> {
	const user = await requireAuth();
	await authorize({ permission: "content.write" });
	return submitCourseForReview(db, {
		courseId: input.id,
		actorId: user.id,
		ip: clientIp(),
	});
}
