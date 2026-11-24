import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { decideBulk } from "../../../../core/learning/bulk";
import { reviewCenters } from "../../../../core/learning/review-queue";
import { db } from "../../../../db";

/** Decide each selected attempt on its own. */
export async function createBulkVerification(input: {
	submissionIds: string[];
	decision: string;
	note?: string;
	reasonCode?: string;
}): Promise<{ count: number }> {
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
	return decideBulk(db, {
		reviewerId: user.id,
		submissionIds: input.submissionIds,
		decision: input.decision,
		note: input.note,
		reasonCode: input.reasonCode,
		ip: clientIp(),
	});
}
