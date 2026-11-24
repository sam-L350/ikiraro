import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { createTour } from "../../../../core/coverage/tours";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Store a temporary place and the center people return to. */
export async function createPopupTour(input: {
	place: string;
	homeCenterId: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return createTour(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		place: input.place,
		homeCenterId: input.homeCenterId,
		ip: clientIp(),
	});
}
