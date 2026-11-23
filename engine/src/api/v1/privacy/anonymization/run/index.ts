import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import { anonymizeQueued } from "../../../../../core/identity/anonymize";
import { db } from "../../../../../db";

/**
 * Clears personal details on queued deletions.
 * Verification rows and ledger rows stay attached to the same user id.
 */
export async function createPrivacyAnonymization(): Promise<{
	completed: number;
}> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return anonymizeQueued(db, { actorId: user.id, ip: clientIp() });
}
