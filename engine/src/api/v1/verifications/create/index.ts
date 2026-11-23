import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { reviewCenters } from "../../../../core/learning/review-queue";
import {
	createVerification as recordVerification,
	type ScoreInput,
} from "../../../../core/learning/verifications";
import { db } from "../../../../db";

/** Record needs-revision or rejected. Approval is stored with the award. */
export async function createVerification(input: {
	submissionId: string;
	decision: string;
	note?: string;
	reasonCode?: string;
	scores?: ScoreInput[];
}): Promise<{
	id: string;
	submissionId: string;
	decision: "needs_revision" | "rejected";
	scoreTotal: number | null;
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
	return recordVerification(db, {
		reviewerId: user.id,
		submissionId: input.submissionId,
		decision: input.decision,
		note: input.note,
		reasonCode: input.reasonCode,
		scores: input.scores,
		ip: clientIp(),
	});
}
