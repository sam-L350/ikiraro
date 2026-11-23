import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import {
	publishCourse,
	type ReviewCourse,
} from "../../../../../core/content/review";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Publish a course after a reviewer other than the author has approved it. */
export async function createReviewPublication(input: {
	id: string;
}): Promise<ReviewCourse> {
	const user = await requireAuth();
	await authorize({ permission: "content.publish" });
	return publishCourse(db, {
		courseId: input.id,
		actorId: user.id,
		ip: clientIp(),
	});
}
