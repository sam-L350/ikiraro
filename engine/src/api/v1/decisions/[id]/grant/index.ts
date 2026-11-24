import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import {
	decideGrant,
	type GrantResult,
} from "../../../../../core/hardware/grants";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Award one item. The decision, the grant, and the stock change commit together. */
export async function createDecisionGrant(input: {
	id: string;
	applicationId: string;
	inventoryId: string;
	reason: string;
	idempotencyKey: string;
}): Promise<GrantResult> {
	const user = await requireAuth();
	await authorize({ permission: "grant.decide" });
	return decideGrant(db, {
		actorId: user.id,
		roundId: input.id,
		applicationId: input.applicationId,
		inventoryId: input.inventoryId,
		reason: input.reason,
		idempotencyKey: input.idempotencyKey,
		ip: clientIp(),
	});
}
