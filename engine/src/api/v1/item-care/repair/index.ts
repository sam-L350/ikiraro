import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { recordRepair } from "../../../../core/hardware/repairs";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Write what was repaired. */
export async function createItemRepair(input: {
	inventoryId: string;
	note: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return recordRepair(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		inventoryId: input.inventoryId,
		note: input.note,
		ip: clientIp(),
	});
}
