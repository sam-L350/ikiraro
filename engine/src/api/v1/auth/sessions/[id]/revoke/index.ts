import {
	appendResponseHeader,
	getRequestContext,
} from "../../../../../../core/api/context";
import { requireAuth } from "../../../../../../core/auth/require-auth";
import {
	clearSessionCookie,
	getSessionTokenFromRequest,
	revokeSession,
} from "../../../../../../core/auth/sessions";
import { authorize } from "../../../../../../core/authz/authorize";
import { clientIp } from "../../../../../../core/http/client-ip";
import { db } from "../../../../../../db";

/** End one session that belongs to the signed-in person. */
export async function deleteAuthSession(input: {
	id: string;
}): Promise<{ revoked: true }> {
	const user = await requireAuth();
	await authorize({
		permission: "profile.write.self",
		resource: { ownerId: String(user.id) },
	});
	const token = getSessionTokenFromRequest(getRequestContext().request) ?? "";
	const result = await revokeSession(db, {
		userId: user.id,
		sessionId: input.id,
		token,
		ip: clientIp(),
	});
	if (result.current) {
		appendResponseHeader("set-cookie", clearSessionCookie());
	}
	return { revoked: true };
}
