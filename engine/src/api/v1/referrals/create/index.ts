import { requireAuth } from "../../../../core/auth/require-auth";
import { recommendLearner } from "../../../../core/hardware/opportunities";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Write a recommendation. It stays off the passport until the learner allows it. */
export async function createReferral(input: {
	learnerId: number;
	note: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return recommendLearner(db, {
		actorId: user.id,
		learnerId: input.learnerId,
		note: input.note,
		ip: clientIp(),
	});
}
