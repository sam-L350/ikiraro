import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { countQueuedRemovals } from "../../../../core/identity/anonymize";
import { db } from "../../../../db";

/** How many deletion requests are still waiting for the removal job. */
export async function getPrivacyAnonymization(): Promise<{ queued: number }> {
	await requireAuth();
	await authorize({ permission: "admin.manage" });
	return { queued: await countQueuedRemovals(db) };
}
