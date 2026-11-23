import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	type PreferenceView,
	updateNotificationPreference as saveNotificationPreference,
} from "../../../../core/notifications/inbox";
import { db } from "../../../../db";

/** Turn one channel on or off for one event. */
export async function updateNotificationPreference(input: {
	eventName: string;
	channel: string;
	enabled: boolean;
}): Promise<PreferenceView[]> {
	const user = await requireAuth();
	await authorize({
		permission: "profile.write.self",
		resource: { ownerId: String(user.id) },
	});
	return saveNotificationPreference(db, { ...input, userId: user.id });
}
