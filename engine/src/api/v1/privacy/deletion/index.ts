import { appendResponseHeader } from "../../../../core/api/context";
import { requireAuth } from "../../../../core/auth/require-auth";
import { clearSessionCookie } from "../../../../core/auth/sessions";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { requestDeletion } from "../../../../core/identity/privacy";
import { db } from "../../../../db";

/**
 * Queue anonymization. The user row becomes a tombstone and stays, so later
 * reviews and ledger rows are not destroyed. This request is an audit event.
 */
export async function createPrivacyDeletion(): Promise<{
	id: string;
	status: "queued";
}> {
	const user = await requireAuth();
	await authorize({
		permission: "profile.write.self",
		resource: { ownerId: String(user.id) },
	});
	const result = await requestDeletion(db, {
		userId: user.id,
		ip: clientIp(),
	});
	appendResponseHeader("set-cookie", clearSessionCookie());
	return result;
}
