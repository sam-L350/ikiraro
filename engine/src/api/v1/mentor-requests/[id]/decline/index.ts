import { requireAuth } from "../../../../../core/auth/require-auth";
import { declineMentorRequest } from "../../../../../core/hardware/mentors";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** The learner declines the request. */
export async function createMentorRequestDecline(input: {
	id: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return declineMentorRequest(db, {
		userId: user.id,
		requestId: input.id,
		ip: clientIp(),
	});
}
