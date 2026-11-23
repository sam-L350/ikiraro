import {
	type SmsMessage,
	SmsPermanentError,
	type SmsSender,
	type SmsSendResult,
} from "./sender";

const LIVE_URL = "https://api.africastalking.com/version1/messaging";
const SANDBOX_URL = "https://api.sandbox.africastalking.com/version1/messaging";

const ACCEPTED = new Set([100, 101, 102]);
const RETRYABLE = new Set([500, 501, 502]);

export type AfricasTalkingAccount = {
	username: string;
	apiKey: string;
	senderId?: string;
	sandbox: boolean;
	provider: string;
};

type Recipient = {
	statusCode?: number;
	messageId?: string;
	cost?: string;
};

/** Whole currency units from a provider cost such as "RWF 10.0000". */
export function parseProviderCost(
	cost: string | null | undefined,
): { currency: string; amount: number } | null {
	if (!cost) return null;
	const match = /^([A-Z]{3})\s+(-?\d+(?:\.\d+)?)$/.exec(cost.trim());
	if (!match) return null;
	const currency = match[1];
	const parsed = match[2] === undefined ? Number.NaN : Number(match[2]);
	if (!currency || !Number.isFinite(parsed) || parsed < 0) return null;
	return { currency, amount: Math.round(parsed) };
}

function recipientsOf(payload: unknown): Recipient[] {
	if (!payload || typeof payload !== "object") return [];
	const data = (payload as { SMSMessageData?: unknown }).SMSMessageData;
	if (!data || typeof data !== "object") return [];
	const recipients = (data as { Recipients?: unknown }).Recipients;
	if (!Array.isArray(recipients)) return [];
	return recipients.filter(
		(item): item is Recipient => item !== null && typeof item === "object",
	);
}

/**
 * Reads the first recipient. Accepted codes keep the message id.
 * A rejected number is permanent. A gateway fault is retryable.
 */
export function parseAfricasTalkingSend(
	payload: unknown,
	provider: string,
): SmsSendResult {
	const first = recipientsOf(payload)[0];
	if (!first) throw new Error("sms_empty");
	const statusCode = first.statusCode;
	if (statusCode === undefined || RETRYABLE.has(statusCode)) {
		throw new Error("sms_retry");
	}
	if (!ACCEPTED.has(statusCode)) throw new SmsPermanentError();
	if (!first.messageId) throw new Error("sms_retry");
	const cost = parseProviderCost(first.cost);
	return {
		provider,
		providerMessageId: first.messageId,
		currency: cost?.currency ?? "RWF",
		amount: cost?.amount ?? 0,
	};
}

export function createAfricasTalkingSender(
	account: AfricasTalkingAccount,
	fetchImpl: typeof fetch = fetch,
): SmsSender {
	return {
		async send(message: SmsMessage) {
			const form = new URLSearchParams();
			form.set("username", account.username);
			form.set("to", message.to);
			form.set("message", message.body);
			if (account.senderId) form.set("from", account.senderId);
			const response = await fetchImpl(
				account.sandbox ? SANDBOX_URL : LIVE_URL,
				{
					method: "POST",
					headers: {
						apiKey: account.apiKey,
						Accept: "application/json",
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: form,
				},
			);
			if (!response.ok) throw new Error(`sms_http_${response.status}`);
			const payload: unknown = await response.json();
			return parseAfricasTalkingSend(payload, account.provider);
		},
	};
}
