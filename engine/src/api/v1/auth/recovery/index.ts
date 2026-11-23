import { requestRecovery } from "../../../../core/auth/recovery";
import { clientIp } from "../../../../core/http/client-ip";
import { smsSender } from "../../../../core/sms/select";
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
		smsSender(),
	);
}
