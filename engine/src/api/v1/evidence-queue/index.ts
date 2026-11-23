import { errors } from "../../../core/api/error";
import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	type EvidenceQueue,
	listEvidenceQueue,
	reviewCenters,
} from "../../../core/learning/review-queue";
import { db } from "../../../db";

/** Oldest waiting evidence at the centers this person reviews. */
export async function getEvidenceQueue(input: {
	centerId?: string;
}): Promise<EvidenceQueue> {
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
	return listEvidenceQueue(db, {
		reviewerId: user.id,
		centerId: input.centerId,
	});
}
