import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { requestException } from "../../../../core/hardware/recovery";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Ask a different admin to set a rule aside. The request is not public. */
export async function createException(input: {
	grantId: string;
	reason: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return requestException(db, {
		actorId: user.id,
		grantId: input.grantId,
		reason: input.reason,
		ip: clientIp(),
	});
}
