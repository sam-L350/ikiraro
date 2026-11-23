export type EmailMessage = {
	to: string;
	subject: string;
	body: string;
};

export type EmailSendResult = "sent" | "not_configured";

/** Port for a real mailbox. Phase 6.1 holds the row until credentials exist. */
export type EmailSender = {
	send(message: EmailMessage): Promise<EmailSendResult>;
};

/** Does not open a socket. The notification stays queued. */
export const holdingEmailSender: EmailSender = {
	async send() {
		return "not_configured";
	},
};
