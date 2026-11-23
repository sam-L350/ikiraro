import { errors } from "../../../core/api/error";
import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import { type AppealItem, listAppeals } from "../../../core/learning/appeals";
import { reviewCenters } from "../../../core/learning/review-queue";
import { db } from "../../../db";

/** Open appeals at the centers this person reviews, except their own rejections. */
export async function getAppeals(): Promise<{ items: AppealItem[] }> {
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
	return listAppeals(db, { reviewerId: user.id });
}
