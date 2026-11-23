import { isApiError } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	type AnnouncementScope,
	createAnnouncement,
} from "../../../../core/notifications/announce";
import { db } from "../../../../db";

/** Ask the drainer to deliver one center or district announcement. */
export async function createAnnouncementPost(input: {
	scope: AnnouncementScope;
	scopeId: string;
	title: string;
	body: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	try {
		return await createAnnouncement(db, {
			...input,
			actorId: user.id,
			ip: clientIp(),
		});
	} catch (error) {
		if (isApiError(error) && error.status === 403) {
			await authorize({ permission: "admin.manage" });
		}
		throw error;
	}
}
