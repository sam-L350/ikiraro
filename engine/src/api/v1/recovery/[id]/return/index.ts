import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { recoverItem } from "../../../../../core/hardware/recovery";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Return the item to stock and store why. */
export async function createRecoveryReturn(input: {
	id: string;
	situation: string;
	reason: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "hardware.manage" });
	return recoverItem(db, {
		actorId: user.id,
		grantId: input.id,
		situation: input.situation,
		reason: input.reason,
		ip: clientIp(),
	});
}
