import { appendResponseHeader } from "../../../../core/api/context";
import { errors } from "../../../../core/api/error";
import { login } from "../../../../core/auth/login";
import { sessionCookie } from "../../../../core/auth/sessions";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/**
 * Sign in with a one-time code or with email and password.
 * Public: the person has no session yet. The password hash and the code
 * hash are never returned. The session is the existing HttpOnly cookie.
 */
export async function createAuthSession(input: {
	method: "otp" | "password";
	phone?: string;
	code?: string;
	email?: string;
	password?: string;
}): Promise<{ id: number; email: string; name: string | null }> {
	const ip = clientIp();
	switch (input.method) {
		case "otp": {
			if (!input.phone || !input.code) {
				throw errors.badRequest("Enter the code we sent.", {
					reason: "wrong_code",
				});
			}
			const session = await login(db, {
				method: "otp",
				phone: input.phone,
				code: input.code,
				ip,
			});
			appendResponseHeader("set-cookie", sessionCookie(session.token));
			return session.user;
		}
		case "password": {
			if (!input.email || !input.password) {
				throw errors.badRequest("The email or password is wrong.", {
					reason: "wrong_password",
				});
			}
			const session = await login(db, {
				method: "password",
				email: input.email,
				password: input.password,
				ip,
			});
			appendResponseHeader("set-cookie", sessionCookie(session.token));
			return session.user;
		}
		default: {
			const unreachable: never = input.method;
			return unreachable;
		}
	}
}
