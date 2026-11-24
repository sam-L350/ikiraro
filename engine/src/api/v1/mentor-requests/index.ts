import { requireAuth } from "../../../core/auth/require-auth";
import { requestLearner } from "../../../core/hardware/mentors";
import { clientIp } from "../../../core/http/client-ip";
import { db } from "../../../db";

/** Ask a learner who opted in. The weekly cap is the one stored on the mentor. */
export async function createMentorRequest(input: {
	optInId: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return requestLearner(db, {
		userId: user.id,
		optInId: input.optInId,
		ip: clientIp(),
	});
}
