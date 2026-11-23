import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import {
	type InboxItem,
	markNotificationRead,
} from "../../../../../core/notifications/inbox";
import { db } from "../../../../../db";

/** Mark one inbox message read. Someone else's message stays hidden. */
export async function createNotificationRead(input: {
	id: string;
}): Promise<InboxItem> {
	const user = await requireAuth();
	await authorize({
		permission: "profile.write.self",
		resource: { ownerId: String(user.id) },
	});
	return markNotificationRead(db, { id: input.id, userId: user.id });
}
