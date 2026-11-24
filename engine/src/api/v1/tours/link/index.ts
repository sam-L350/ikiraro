import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { linkTourHome } from "../../../../core/coverage/tours";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Set the learner's home center to the tour's center. */
export async function createTourHomeLink(input: {
	tourId: string;
	userId: number;
}): Promise<{ tourId: string }> {
	const user = await requireAuth();
	return linkTourHome(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		tourId: input.tourId,
		userId: input.userId,
		ip: clientIp(),
	});
}
