import type { AppEnvironment } from "../../config/env";
import { env } from "../../config/env";
import {
	type AfricasTalkingAccount,
	createAfricasTalkingSender,
} from "./africastalking";
import { withFailover } from "./failover";
import { logSmsSender, type SmsSender, unconfiguredSmsSender } from "./sender";

export type SmsChoice = {
	appEnv: AppEnvironment;
	primary: AfricasTalkingAccount | null;
	fallback: AfricasTalkingAccount | null;
	fetchImpl?: typeof fetch;
};

/**
 * Tests always keep the log adapter, even when a shell has gateway keys.
 * Development without keys logs. Production without keys leaves the text queued.
 */
export function chooseSmsSender(input: SmsChoice): SmsSender {
	if (input.appEnv === "test") return logSmsSender;
	if (!input.primary) {
		return input.appEnv === "production" ? unconfiguredSmsSender : logSmsSender;
	}
	const primary = createAfricasTalkingSender(input.primary, input.fetchImpl);
	if (!input.fallback) return primary;
	return withFailover(
		primary,
		createAfricasTalkingSender(input.fallback, input.fetchImpl),
	);
}

function account(
	username: string | undefined,
	apiKey: string | undefined,
	senderId: string | undefined,
	sandbox: boolean,
	provider: string,
): AfricasTalkingAccount | null {
	if (!username || !apiKey) return null;
	return {
		username,
		apiKey,
		senderId,
		sandbox,
		provider,
	};
}

/** The sender for this process. Call it when sending, not at import time. */
export function smsSender(): SmsSender {
	const sms = env.sms;
	return chooseSmsSender({
		appEnv: env.appEnv,
		primary: account(
			sms.username,
			sms.apiKey,
			sms.senderId,
			sms.sandbox,
			"africastalking",
		),
		fallback: account(
			sms.fallbackUsername,
			sms.fallbackApiKey,
			sms.fallbackSenderId,
			sms.sandbox,
			"africastalking-fallback",
		),
	});
}
