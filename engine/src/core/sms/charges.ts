import { eq } from "drizzle-orm";
import type { Database } from "../../db";
import { notifications, smsCharges } from "../../db/schema";
import type { SmsSendResult } from "./sender";

type ChargeDb = Pick<Database, "insert" | "select" | "update">;

export type SmsSpend = {
	userId: number | null;
	centerId: string | null;
	notificationId: string | null;
	provider: string;
	providerMessageId: string;
	currency: string;
	amount: number;
};

/** Keeps the first row for a gateway id. A retry must not double-count the center. */
export async function rememberSmsSpend(
	database: ChargeDb,
	input: SmsSpend,
): Promise<void> {
	const [existing] = await database
		.select({ id: smsCharges.id })
		.from(smsCharges)
		.where(eq(smsCharges.providerMessageId, input.providerMessageId))
		.limit(1);
	if (existing) return;
	await database.insert(smsCharges).values({
		userId: input.userId,
		centerId: input.centerId,
		notificationId: input.notificationId,
		provider: input.provider,
		providerMessageId: input.providerMessageId,
		currency: input.currency,
		amount: input.amount,
		status: "accepted",
	});
}

/**
 * A gateway id waits for a receipt. The log adapter has no id, so the notice
 * is sent immediately.
 */
export async function recordAcceptedSend(
	database: ChargeDb,
	row: { id: string; userId: number; centerId: string | null },
	// biome-ignore lint/suspicious/noConfusingVoidType: the log adapter returns Promise<void>
	result: SmsSendResult | void,
): Promise<"sent" | "submitted"> {
	if (!result?.providerMessageId) {
		await database
			.update(notifications)
			.set({ status: "sent", sentAt: new Date(), lastError: null })
			.where(eq(notifications.id, row.id));
		return "sent";
	}
	await rememberSmsSpend(database, {
		userId: row.userId,
		centerId: row.centerId,
		notificationId: row.id,
		provider: result.provider,
		providerMessageId: result.providerMessageId,
		currency: result.currency,
		amount: result.amount,
	});
	await database
		.update(notifications)
		.set({
			status: "submitted",
			providerMessageId: result.providerMessageId,
			lastError: null,
		})
		.where(eq(notifications.id, row.id));
	return "submitted";
}
