import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	checkInToSession,
	type StoredAttendance,
} from "../../../../core/learning/center-sessions";
import { db } from "../../../../db";

/** A learner checks in with the code on the session. */
export async function createCenterSessionCheckIn(input: {
	token: string;
	attendanceId: string;
}): Promise<StoredAttendance> {
	const user = await requireAuth();
	await authorize({
		permission: "learning.progress",
		resource: { ownerId: String(user.id) },
	});
	return checkInToSession(db, {
		learnerId: user.id,
		token: input.token,
		attendanceId: input.attendanceId,
		ip: clientIp(),
	});
}
