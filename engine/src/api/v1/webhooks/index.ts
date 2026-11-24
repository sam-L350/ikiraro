import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import {
	readPartnerWebhooks,
	type WebhookRow,
} from "../../../core/partners/webhooks";
import { db } from "../../../db";

/** Partner addresses and the event each one hears. */
export async function getPartnerWebhooks(): Promise<{ hooks: WebhookRow[] }> {
	const user = await requireAuth();
	return readPartnerWebhooks(db, await loadAssignments(user.id));
}
