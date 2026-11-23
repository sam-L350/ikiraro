import { eq } from "drizzle-orm";
import type { Database } from "../../db";
import { notifications, smsCharges } from "../../db/schema";
import { SMS_SEND_LIMIT } from "./sender";

export type DeliveryReceipt = {
	id: string;
	status: string;
	failureReason: string | null;
};

type ReceiptDb = Pick<Database, "select" | "update">;

function textField(
	record: Record<string, unknown>,
	key: string,
): string | null {
	const value = record[key];
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function receiptFromRecord(value: unknown): DeliveryReceipt {
	if (!value || typeof value !== "object") throw new Error("sms_receipt");
	const record = value as Record<string, unknown>;
	const id = textField(record, "id");
	const status = textField(record, "status");
	if (!id || !status) throw new Error("sms_receipt");
	return {
		id,
		status,
		failureReason: textField(record, "failureReason"),
	};
}

/** Africa's Talking posts a form body. Tests may post JSON with the same fields. */
export function parseDeliveryReceipt(
	body: string,
	contentType: string | null,
): DeliveryReceipt {
	const trimmed = body.trim();
	const asJson =
		trimmed.startsWith("{") || (contentType ?? "").includes("json");
	if (asJson) return receiptFromRecord(JSON.parse(trimmed));
	return receiptFromRecord(Object.fromEntries(new URLSearchParams(trimmed)));
}

/** Success is the handset. Failed can be tried again. Rejected and Expired cannot. */
export function receiptEffect(
	status: string,
): "delivered" | "pending" | "retry" | "final" {
	switch (status) {
		case "Success":
			return "delivered";
		case "Sent":
		case "Submitted":
		case "Buffered":
			return "pending";
		case "Failed":
		case "AbsentSubscriber":
			return "retry";
		case "Rejected":
		case "Expired":
			return "final";
		default:
			return "pending";
	}
}

/**
 * Moves a submitted notice from the receipt. An unknown id is ignored so the
 * provider can stop retrying the callback.
 */
export async function applyDeliveryReceipt(
	database: ReceiptDb,
	receipt: DeliveryReceipt,
): Promise<{ matched: boolean }> {
	const [row] = await database
		.select({
			id: notifications.id,
			attempts: notifications.attempts,
			status: notifications.status,
		})
		.from(notifications)
		.where(eq(notifications.providerMessageId, receipt.id))
		.limit(1);
	const effect = receiptEffect(receipt.status);
	if (effect === "delivered") {
		await database
			.update(smsCharges)
			.set({ status: "delivered", deliveredAt: new Date() })
			.where(eq(smsCharges.providerMessageId, receipt.id));
	}
	if (effect === "retry" || effect === "final") {
		await database
			.update(smsCharges)
			.set({ status: "failed" })
			.where(eq(smsCharges.providerMessageId, receipt.id));
	}
	if (!row) return { matched: false };
	if (effect === "pending") return { matched: true };
	if (effect === "delivered") {
		await database
			.update(notifications)
			.set({ status: "sent", sentAt: new Date(), lastError: null })
			.where(eq(notifications.id, row.id));
		return { matched: true };
	}
	const attempts = row.attempts + 1;
	const failed = effect === "final" || attempts >= SMS_SEND_LIMIT;
	await database
		.update(notifications)
		.set({
			attempts,
			status: failed ? "failed" : "queued",
			lastError: receipt.failureReason ?? receipt.status,
			providerMessageId: null,
		})
		.where(eq(notifications.id, row.id));
	return { matched: true };
}
