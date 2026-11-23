import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	updateNotificationTemplate as saveNotificationTemplate,
	type TemplateView,
} from "../../../../core/notifications/inbox";
import { db } from "../../../../db";

/** Replace one template sentence. The next drain uses the new words. */
export async function updateNotificationTemplate(input: {
	id: string;
	title: string;
	body: string;
}): Promise<TemplateView> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return saveNotificationTemplate(db, {
		...input,
		actorId: user.id,
		ip: clientIp(),
	});
}
