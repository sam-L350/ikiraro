import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { attendTour } from "../../../../core/coverage/tours";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Mark that a signed-up learner came. */
export async function createTourAttendance(input: {
	sessionId: string;
	userId: number;
}): Promise<{ sessionId: string }> {
	const user = await requireAuth();
	return attendTour(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		sessionId: input.sessionId,
		userId: input.userId,
		ip: clientIp(),
	});
}
