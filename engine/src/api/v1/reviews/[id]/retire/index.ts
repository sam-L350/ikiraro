import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import {
	type ReviewCourse,
	retireCourse,
} from "../../../../../core/content/review";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Retire a published course. The rows stay, so the course can still be read. */
export async function createReviewRetirement(input: {
	id: string;
}): Promise<ReviewCourse> {
	const user = await requireAuth();
	await authorize({ permission: "content.publish" });
	return retireCourse(db, {
		courseId: input.id,
		actorId: user.id,
		ip: clientIp(),
	});
}
