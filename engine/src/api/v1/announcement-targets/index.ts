import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	type AnnouncementTarget,
	listAnnouncementTargets,
} from "../../../core/notifications/announce";
import { db } from "../../../db";

/** Places the signed-in person may send an announcement. */
export async function listAnnouncementTargetsQueue(): Promise<{
	centers: AnnouncementTarget[];
	districts: AnnouncementTarget[];
}> {
	const user = await requireAuth();
	const targets = await listAnnouncementTargets(db, user.id);
	if (!targets.allowed) {
		await authorize({ permission: "admin.manage" });
	}
	return { centers: targets.centers, districts: targets.districts };
}
