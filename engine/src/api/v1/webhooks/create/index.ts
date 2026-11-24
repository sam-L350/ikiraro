import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	createPartnerWebhook as storePartnerWebhook,
	type WebhookRow,
} from "../../../../core/partners/webhooks";
import { db } from "../../../../db";

/** Store one https address for a credential or a grant. */
export async function createPartnerWebhook(input: {
	url: string;
	event: string;
}): Promise<WebhookRow> {
	const user = await requireAuth();
	return storePartnerWebhook(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		url: input.url,
		event: input.event,
		ip: clientIp(),
	});
}
