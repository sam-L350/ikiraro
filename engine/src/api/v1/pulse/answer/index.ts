import { requireAuth } from "../../../../core/auth/require-auth";
import { clientIp } from "../../../../core/http/client-ip";
import { answerPulse } from "../../../../core/support/pulse";
import { db } from "../../../../db";

/** Store one answer for the open moment. */
export async function createSatisfactionPulse(input: {
	moment: string;
	verificationId?: string;
	body: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return answerPulse(db, {
		userId: user.id,
		moment: input.moment,
		verificationId: input.verificationId,
		body: input.body,
		ip: clientIp(),
	});
}
