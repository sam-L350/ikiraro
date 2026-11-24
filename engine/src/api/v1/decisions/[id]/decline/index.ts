import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { declineApplication } from "../../../../../core/hardware/grants";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Record a no, with the reason, and leave the item in stock. */
export async function createDecisionDecline(input: {
	id: string;
	applicationId: string;
	reason: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "grant.decide" });
	return declineApplication(db, {
		actorId: user.id,
		roundId: input.id,
		applicationId: input.applicationId,
		reason: input.reason,
		ip: clientIp(),
	});
}
