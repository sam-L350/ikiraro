import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { recordWarranty } from "../../../../core/hardware/repairs";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Write the warranty end date. */
export async function createItemWarranty(input: {
	inventoryId: string;
	endsOn: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return recordWarranty(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		inventoryId: input.inventoryId,
		endsOn: input.endsOn,
		ip: clientIp(),
	});
}
