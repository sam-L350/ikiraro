import { createOtp } from "../../../../core/auth/login";
import { clientIp } from "../../../../core/http/client-ip";
import { smsSender } from "../../../../core/sms/select";
import { db } from "../../../../db";

/**
 * Ask for a one-time code. Public: the person has no session yet.
 * The code is handed to the SMS sender and is not part of this response.
 */
export async function createAuthOtp(input: {
	phone: string;
}): Promise<{ sent: true }> {
	return createOtp(db, { phone: input.phone, ip: clientIp() }, smsSender());
}
