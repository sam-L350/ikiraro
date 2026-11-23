import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	type EvidenceReview,
	readEvidenceReview,
	reviewCenters,
} from "../../../../core/learning/review-queue";
import { getObjectStore } from "../../../../core/storage/object-store";
import { db } from "../../../../db";

/** The evidence and the rubric for one waiting attempt. */
export async function getEvidenceReview(input: {
	id: string;
}): Promise<EvidenceReview> {
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
	return readEvidenceReview(db, getObjectStore(), {
		reviewerId: user.id,
		id: input.id,
	});
}
