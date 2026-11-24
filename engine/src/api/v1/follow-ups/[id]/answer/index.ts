import { requireAuth } from "../../../../../core/auth/require-auth";
import { answerFollowUp } from "../../../../../core/hardware/follow-ups";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** The recipient says whether the device is in use, and for what. */
export async function createFollowUpAnswer(input: {
	id: string;
	inUse: boolean;
	purpose?: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return answerFollowUp(db, {
		followUpId: input.id,
		actorId: user.id,
		inUse: input.inUse,
		purpose: input.purpose,
		ip: clientIp(),
	});
}
