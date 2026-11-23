import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import { rotateShareToken } from "../../../../../core/learning/share";
import { db } from "../../../../../db";

/** Issue a new share token. The previous link stops working. */
export async function createPassportShareLink(): Promise<{ token: string }> {
	const user = await requireAuth();
	await authorize({
		permission: "learning.progress",
		resource: { ownerId: String(user.id) },
	});
	return rotateShareToken(db, { userId: user.id, ip: clientIp() });
}
