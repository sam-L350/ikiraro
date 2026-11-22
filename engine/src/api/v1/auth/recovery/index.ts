import { requestRecovery } from "../../../../core/auth/recovery";
import { clientIp } from "../../../../core/http/client-ip";
import { logSmsSender } from "../../../../core/sms/sender";
import { db } from "../../../../db";

/**
 * Ask for a recovery code. Public. The send is rate-limited, and the code
 * is not part of this response.
 */
export async function createAuthRecovery(input: {
	phone: string;
}): Promise<{ sent: true }> {
	return requestRecovery(
		db,
		{ phone: input.phone, ip: clientIp() },
		logSmsSender,
	);
}
