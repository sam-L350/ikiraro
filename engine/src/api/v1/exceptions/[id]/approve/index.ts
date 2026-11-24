import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { approveException } from "../../../../../core/hardware/recovery";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** A different admin approves the exception and makes the reason public. */
export async function createExceptionApproval(input: {
	id: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return approveException(db, {
		actorId: user.id,
		exceptionId: input.id,
		ip: clientIp(),
	});
}
