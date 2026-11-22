import { appendResponseHeader } from "../../../../core/api/context";
import { sessionCookie } from "../../../../core/auth/sessions";
import { clientIp } from "../../../../core/http/client-ip";
import { activateLearner } from "../../../../core/identity/register";
import { db } from "../../../../db";

/**
 * Activates a registration with the learner's one-time code and opens a session.
 * Public: the learner has no session yet. A wrong code leaves the account inactive.
 */
export async function createRegistrationActivation(input: {
	phone: string;
	code: string;
}): Promise<{ id: number; email: string; name: string | null }> {
	const session = await activateLearner(db, {
		phone: input.phone,
		code: input.code,
		ip: clientIp(),
	});
	appendResponseHeader("set-cookie", sessionCookie(session.token));
	return session.user;
}
