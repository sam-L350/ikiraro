import { errors } from "../../../../../core/api/error";
import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import {
	type ClosedAppeal,
	closeAppeal,
} from "../../../../../core/learning/appeals";
import { reviewCenters } from "../../../../../core/learning/review-queue";
import { db } from "../../../../../db";

/** Uphold the rejection or let the learner try again. The rejection stays stored. */
export async function createAppealClose(input: {
	id: string;
	outcome: string;
	note: string;
}): Promise<ClosedAppeal> {
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
	return closeAppeal(db, {
		reviewerId: user.id,
		appealId: input.id,
		outcome: input.outcome,
		note: input.note,
		ip: clientIp(),
	});
}
