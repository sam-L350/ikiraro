import { appendResponseHeader } from "../../../../../core/api/context";
import { recoverSession } from "../../../../../core/auth/recovery";
import { sessionCookie } from "../../../../../core/auth/sessions";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/**
 * Finish recovery with the code and open a session. Public. Wrong codes
 * lock the phone. A removed account cannot be recovered.
 */
export async function createAuthRecoverySession(input: {
	phone: string;
	code: string;
}): Promise<{ id: number; email: string; name: string | null }> {
	const session = await recoverSession(db, {
		phone: input.phone,
		code: input.code,
		ip: clientIp(),
	});
	appendResponseHeader("set-cookie", sessionCookie(session.token));
	return session.user;
}
