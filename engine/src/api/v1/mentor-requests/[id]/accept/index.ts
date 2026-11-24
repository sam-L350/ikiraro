import { requireAuth } from "../../../../../core/auth/require-auth";
import { acceptMentorRequest } from "../../../../../core/hardware/mentors";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** The learner accepts the request. */
export async function createMentorAcceptance(input: {
	id: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return acceptMentorRequest(db, {
		userId: user.id,
		requestId: input.id,
		ip: clientIp(),
	});
}
