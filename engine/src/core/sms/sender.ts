import { logger } from "../logger";

export type SmsMessage = {
	to: string;
	body: string;
};

/** What a gateway returns when it accepts a text. A receipt later marks it delivered. */
export type SmsSendResult = {
	provider: string;
	providerMessageId: string;
	currency: string;
	amount: number;
};

/**
 * The number or the sender id was rejected. Retrying the same gateway will not help.
 * A transport failure stays a plain Error so the outbox can try again.
 */
export class SmsPermanentError extends Error {
	constructor(message = "sms_rejected") {
		super(message);
		this.name = "SmsPermanentError";
	}
}

/** How many times the outbox will ask a gateway before the notice is failed. */
export const SMS_SEND_LIMIT = 5;

/**
 * Port for a gateway. The log adapter returns nothing, which the outbox treats
 * as sent, because no delivery receipt will arrive. A gateway returns an id.
 */
export type SmsSender = {
	// biome-ignore lint/suspicious/noConfusingVoidType: test senders return Promise<void>
	send(message: SmsMessage): Promise<SmsSendResult | void>;
};

/** Writes the message to the engine log. The HTTP response never includes it. */
export const logSmsSender: SmsSender = {
	async send(message) {
		logger.info("dev sms", { to: message.to, body: message.body });
	},
};

/** Production with no gateway configured. The notice stays queued instead of looking sent. */
export const unconfiguredSmsSender: SmsSender = {
	async send() {
		throw new Error("sms_not_configured");
	},
};
