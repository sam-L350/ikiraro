import { appendResponseHeader } from "../../../../../core/api/context";
import { requireAuth } from "../../../../../core/auth/require-auth";
import {
	clearSessionCookie,
	revokeAllSessions,
} from "../../../../../core/auth/sessions";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** End every session for this account, including the one on this computer. */
export async function createAuthSessionsRevoke(): Promise<{ revoked: true }> {
	const user = await requireAuth();
	await authorize({
		permission: "profile.write.self",
		resource: { ownerId: String(user.id) },
	});
	const result = await revokeAllSessions(db, {
		userId: user.id,
		ip: clientIp(),
	});
	appendResponseHeader("set-cookie", clearSessionCookie());
	return result;
}
