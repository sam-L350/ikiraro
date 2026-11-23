import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import {
	type ShareSettings,
	type ShareVisibilityInput,
	saveShareVisibility,
} from "../../../../../core/learning/share";
import { db } from "../../../../../db";

/** Save which passport items a stranger with the link may see. */
export async function updatePassportShare(
	input: ShareVisibilityInput,
): Promise<ShareSettings> {
	const user = await requireAuth();
	await authorize({
		permission: "learning.progress",
		resource: { ownerId: String(user.id) },
	});
	return saveShareVisibility(db, {
		...input,
		userId: user.id,
		ip: clientIp(),
	});
}
