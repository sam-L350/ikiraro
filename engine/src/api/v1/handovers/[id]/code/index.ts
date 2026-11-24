import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { requestHandoverCode } from "../../../../../core/hardware/handover";
import { clientIp } from "../../../../../core/http/client-ip";
import { smsSender } from "../../../../../core/sms/select";
import { db } from "../../../../../db";

/** Send a one-time code to the recipient. The code is not returned. */
export async function createHandoverCode(input: {
	id: string;
}): Promise<{ sent: true }> {
	const user = await requireAuth();
	await authorize({ permission: "hardware.manage" });
	return requestHandoverCode(
		db,
		{ actorId: user.id, grantId: input.id, ip: clientIp() },
		smsSender(),
	);
}
