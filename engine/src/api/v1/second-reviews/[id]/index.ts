import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { reviewCenters } from "../../../../core/learning/review-queue";
import {
	readSecondReview,
	type SecondReviewDetail,
} from "../../../../core/learning/second-review";
import { db } from "../../../../db";

/** One second reading, for someone other than the trainer who approved it. */
export async function getSecondReview(input: {
	id: string;
}): Promise<SecondReviewDetail> {
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
	return readSecondReview(db, { reviewerId: user.id, reviewId: input.id });
}
