import { env } from "../../config/env";
import { db } from "../../db";
import type { RequestContext } from "../api/context";
import { defineRawRoutes } from "../api/raw";
import { applyDeliveryReceipt, parseDeliveryReceipt } from "./receipts";

/** Compares the shared secret without leaking which side was longer. */
export function smsSecretsMatch(
	given: string | null,
	expected: string | null,
): boolean {
	if (!given || !expected) return false;
	const left = new TextEncoder().encode(given);
	const right = new TextEncoder().encode(expected);
	if (left.byteLength !== right.byteLength) return false;
	return crypto.timingSafeEqual(left, right);
}

/**
 * Africa's Talking posts a delivery report here. The secret is required.
 * An unknown message id still answers 200 so the provider stops repeating it.
 */
export async function postSmsReceipt(
	context: RequestContext,
): Promise<Response> {
	const expected = env.sms.webhookSecret;
	if (!expected) return new Response(null, { status: 404 });
	const header = context.request.headers.get("x-ikiraro-sms-secret");
	const token = context.url.searchParams.get("token");
	const allowed =
		smsSecretsMatch(header, expected) || smsSecretsMatch(token, expected);
	if (!allowed) return new Response(null, { status: 401 });
	let receipt: ReturnType<typeof parseDeliveryReceipt>;
	try {
		receipt = parseDeliveryReceipt(
			await context.request.text(),
			context.request.headers.get("content-type"),
		);
	} catch {
		return new Response(null, { status: 400 });
	}
	await applyDeliveryReceipt(db, receipt);
	return new Response(null, { status: 200 });
}

export const smsWebhookRoutes = defineRawRoutes([
	{
		method: "POST",
		path: "/api/webhooks/sms/africastalking",
		handler: postSmsReceipt,
	},
]);
