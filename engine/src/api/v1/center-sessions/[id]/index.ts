import { env } from "../../../../config/env";
import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	readCenterSession,
	type SessionDetail,
} from "../../../../core/learning/center-sessions";
import { reviewCenters } from "../../../../core/learning/review-queue";
import { db } from "../../../../db";

/** One session, its check-in code, and the learners who can be marked. */
export async function getCenterSession(input: {
	id: string;
}): Promise<SessionDetail> {
	const user = await requireAuth();
	const centers = await reviewCenters(db, user.id);
	const first = centers[0];
	if (!first) {
		await authorize({
			permission: "submission.review",
			resource: { ownerId: String(user.id) },
		});
		throw errors.forbidden("You do not run a session for a center.");
	}
	await authorize({
		permission: "submission.review",
		resource: { centerId: first.id, districtId: first.districtId },
	});
	return readCenterSession(db, {
		actorId: user.id,
		sessionId: input.id,
		origin: env.webUrl,
	});
}
