import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { writeConditions } from "../../../../../core/hardware/recovery";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Store the conditions the recipient will be asked to agree to. */
export async function createRecoveryConditions(input: {
	id: string;
	conditions: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "hardware.manage" });
	return writeConditions(db, {
		actorId: user.id,
		grantId: input.id,
		conditions: input.conditions,
		ip: clientIp(),
	});
}
