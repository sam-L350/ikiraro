import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { createTourSession } from "../../../../core/coverage/tours";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Add a session at a pop-up. */
export async function createTourSessionSlot(input: {
	tourId: string;
	topic: string;
	startsAt: string;
	minutes: number;
	capacity: number;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return createTourSession(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		tourId: input.tourId,
		topic: input.topic,
		startsAt: input.startsAt,
		minutes: input.minutes,
		capacity: input.capacity,
		ip: clientIp(),
	});
}
