import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { rejectException } from "../../../../../core/hardware/recovery";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** A different admin turns the request down. It stays out of the public list. */
export async function createExceptionDecline(input: {
	id: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return rejectException(db, {
		actorId: user.id,
		exceptionId: input.id,
		ip: clientIp(),
	});
}
