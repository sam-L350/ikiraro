import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	type ReviewCourse,
	readReviewCourse,
} from "../../../../core/content/review";
import { db } from "../../../../db";

/** Read a course in the review queue, including one that has been retired. */
export async function getReview(input: { id: string }): Promise<ReviewCourse> {
	const user = await requireAuth();
	await authorize({ permission: "content.publish" });
	return readReviewCourse(db, { courseId: input.id, actorId: user.id });
}
