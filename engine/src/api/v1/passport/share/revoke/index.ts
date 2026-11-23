import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import { revokeShareToken } from "../../../../../core/learning/share";
import { db } from "../../../../../db";

/** Turn the public link off. The current token dies. */
export async function createPassportShareRevocation(): Promise<{
	token: null;
}> {
	const user = await requireAuth();
	await authorize({
		permission: "learning.progress",
		resource: { ownerId: String(user.id) },
	});
	return revokeShareToken(db, { userId: user.id, ip: clientIp() });
}
