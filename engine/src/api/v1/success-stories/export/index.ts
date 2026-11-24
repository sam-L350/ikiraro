import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { exportPartnerStories } from "../../../../core/impact/stories";
import { getObjectStore } from "../../../../core/storage/object-store";
import { db } from "../../../../db";

/** A file a partner report can include. Phone, email, and village stay out. */
export async function getSuccessStoryExport(): Promise<{ file: string }> {
	const user = await requireAuth();
	return exportPartnerStories(db, getObjectStore(), {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		ip: clientIp(),
	});
}
