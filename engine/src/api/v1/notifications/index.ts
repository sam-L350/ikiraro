import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import { type InboxItem, listInbox } from "../../../core/notifications/inbox";
import { db } from "../../../db";

/** The signed-in person's inbox. Refreshing this is the live update. */
export async function listNotifications(): Promise<InboxItem[]> {
	const user = await requireAuth();
	await authorize({
		permission: "profile.read.self",
		resource: { ownerId: String(user.id) },
	});
	return listInbox(db, user.id);
}
