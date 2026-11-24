import { errors } from "../../../../../core/api/error";
import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import {
	markSessionAttendance,
	type StoredAttendance,
} from "../../../../../core/learning/center-sessions";
import { reviewCenters } from "../../../../../core/learning/review-queue";
import { db } from "../../../../../db";

/** Tick a learner present. The attendance id is the client's, so a retry is the same mark. */
export async function createCenterSessionAttendance(input: {
	id: string;
	learnerId: number;
	attendanceId: string;
}): Promise<StoredAttendance> {
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
	return markSessionAttendance(db, {
		actorId: user.id,
		sessionId: input.id,
		learnerId: input.learnerId,
		attendanceId: input.attendanceId,
		ip: clientIp(),
	});
}
