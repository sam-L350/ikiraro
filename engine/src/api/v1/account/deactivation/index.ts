import { appendResponseHeader } from "../../../../core/api/context";
import { requireAuth } from "../../../../core/auth/require-auth";
import { clearSessionCookie } from "../../../../core/auth/sessions";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { deactivateAccount } from "../../../../core/identity/privacy";
import { db } from "../../../../db";

/** The signed-in person switches the account off. The record stays. */
export async function createAccountDeactivation(): Promise<{
	deactivated: true;
}> {
	const user = await requireAuth();
	await authorize({
		permission: "profile.write.self",
		resource: { ownerId: String(user.id) },
	});
	const result = await deactivateAccount(db, {
		userId: user.id,
		ip: clientIp(),
	});
	appendResponseHeader("set-cookie", clearSessionCookie());
	return result;
}
