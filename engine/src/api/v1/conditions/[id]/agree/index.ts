import { requireAuth } from "../../../../../core/auth/require-auth";
import { agreeConditions } from "../../../../../core/hardware/recovery";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** The recipient agrees to the conditions stored on this grant. */
export async function createConditionAgreement(input: {
	id: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return agreeConditions(db, {
		actorId: user.id,
		grantId: input.id,
		ip: clientIp(),
	});
}
