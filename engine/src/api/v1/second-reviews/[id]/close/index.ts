import { errors } from "../../../../../core/api/error";
import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import { reviewCenters } from "../../../../../core/learning/review-queue";
import {
	type ClosedSecondReview,
	closeSecondReview,
} from "../../../../../core/learning/second-review";
import { db } from "../../../../../db";

/** Record agreement or disagreement. The first approval is left as it was. */
export async function createSecondReviewClose(input: {
	id: string;
	outcome: string;
	note: string;
}): Promise<ClosedSecondReview> {
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
	return closeSecondReview(db, {
		reviewerId: user.id,
		reviewId: input.id,
		outcome: input.outcome,
		note: input.note,
		ip: clientIp(),
	});
}
