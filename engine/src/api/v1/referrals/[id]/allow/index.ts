import { requireAuth } from "../../../../../core/auth/require-auth";
import { allowReferral } from "../../../../../core/hardware/opportunities";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** The learner puts this recommendation on the passport. */
export async function createReferralAllowance(input: {
	id: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return allowReferral(db, {
		userId: user.id,
		referralId: input.id,
		ip: clientIp(),
	});
}
