import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	listNotificationTemplates,
	type TemplateView,
} from "../../../core/notifications/inbox";
import { db } from "../../../db";

/** Every sentence an admin can edit, in both languages and every channel. */
export async function listNotificationTemplatesQueue(): Promise<
	TemplateView[]
> {
	await requireAuth();
	await authorize({ permission: "admin.manage" });
	return listNotificationTemplates(db);
}
