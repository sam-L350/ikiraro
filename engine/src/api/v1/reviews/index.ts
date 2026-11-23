import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	listReviewQueue,
	type ReviewQueue,
} from "../../../core/content/review";
import { db } from "../../../db";

/** Courses a reviewer can approve, publish, or retire. */
export async function getReviews(): Promise<ReviewQueue> {
	await requireAuth();
	await authorize({ permission: "content.publish" });
	return listReviewQueue(db);
}
