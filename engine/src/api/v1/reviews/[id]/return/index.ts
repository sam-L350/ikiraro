import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import {
	type ReviewCourse,
	returnCourse,
} from "../../../../../core/content/review";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Send a course back to its author, with a reason. */
export async function createReviewReturn(input: {
	id: string;
	note: string;
}): Promise<ReviewCourse> {
	const user = await requireAuth();
	await authorize({ permission: "content.publish" });
	return returnCourse(db, {
		courseId: input.id,
		note: input.note,
		actorId: user.id,
		ip: clientIp(),
	});
}
