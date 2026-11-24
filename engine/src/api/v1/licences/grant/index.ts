import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { grantLicenceSeat } from "../../../../core/portable/portable";
import { db } from "../../../../db";

/** Give one free seat to a learner. */
export async function createLicenceGrant(input: {
	licenceId: string;
	userId: number;
}): Promise<{ grantId: string }> {
	const user = await requireAuth();
	return grantLicenceSeat(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		licenceId: input.licenceId,
		userId: input.userId,
		ip: clientIp(),
	});
}
