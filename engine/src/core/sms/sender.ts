import { logger } from "../logger";

export type SmsMessage = {
	to: string;
	body: string;
};

/** Port for a real gateway. Phase 1.2 ships the log adapter only. */
export type SmsSender = {
	send(message: SmsMessage): Promise<void>;
};

/** Writes the message to the engine log. The HTTP response never includes it. */
export const logSmsSender: SmsSender = {
	async send(message) {
		logger.info("dev sms", { to: message.to, body: message.body });
	},
};
