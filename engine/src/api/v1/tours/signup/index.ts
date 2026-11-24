import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { signUpForTour } from "../../../../core/coverage/tours";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Take one place on a pop-up session. */
export async function createTourSignup(input: {
	sessionId: string;
}): Promise<{ sessionId: string }> {
	const user = await requireAuth();
	return signUpForTour(db, {
		userId: user.id,
		assignments: await loadAssignments(user.id),
		sessionId: input.sessionId,
		ip: clientIp(),
	});
}
