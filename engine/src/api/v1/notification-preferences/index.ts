import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	listNotificationPreferences,
	type PreferenceView,
} from "../../../core/notifications/inbox";
import { db } from "../../../db";

/** Channel choices for each event. Missing rows use the default. */
export async function listNotificationPreferencesQueue(): Promise<
	PreferenceView[]
> {
	const user = await requireAuth();
	await authorize({
		permission: "profile.read.self",
		resource: { ownerId: String(user.id) },
	});
	return listNotificationPreferences(db, user.id);
}
