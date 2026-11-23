import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import {
	approveCourse,
	type ReviewCourse,
} from "../../../../../core/content/review";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Record a reviewer's approval. Publishing is a separate step. */
export async function createReviewApproval(input: {
	id: string;
}): Promise<ReviewCourse> {
	const user = await requireAuth();
	await authorize({ permission: "content.publish" });
	return approveCourse(db, {
		courseId: input.id,
		actorId: user.id,
		ip: clientIp(),
	});
}
