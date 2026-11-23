import { errors } from "../../../../../core/api/error";
import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import {
	reviewCenters,
	startEvidenceReview,
} from "../../../../../core/learning/review-queue";
import { db } from "../../../../../db";

/** Mark the attempt in review so the learner can no longer take it back. */
export async function createEvidenceReviewStart(input: {
	id: string;
}): Promise<{ id: string; status: "in_review" }> {
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
	return startEvidenceReview(db, {
		reviewerId: user.id,
		id: input.id,
		ip: clientIp(),
	});
}
