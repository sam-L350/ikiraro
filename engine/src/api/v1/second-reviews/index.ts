import { errors } from "../../../core/api/error";
import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import { reviewCenters } from "../../../core/learning/review-queue";
import {
	listSecondReviews,
	type SecondReviewItem,
} from "../../../core/learning/second-review";
import { db } from "../../../db";

/** Open second readings at the centers this person reviews. */
export async function getSecondReviews(): Promise<{
	items: SecondReviewItem[];
}> {
	const user = await requireAuth();
	const centers = await reviewCenters(db, user.id);
	const first = centers[0];
	if (!first) {
		await authorize({
			permission: "submission.review",
			resource: { ownerId: String(user.id) },
		});
		throw errors.forbidden("You do not review evidence for a center.");
	}
	await authorize({
		permission: "submission.review",
		resource: { centerId: first.id, districtId: first.districtId },
	});
	return listSecondReviews(db, { reviewerId: user.id });
}
