import { SmsPermanentError, type SmsSender } from "./sender";

/**
 * Tries the second gateway only when the first one could not be reached.
 * A rejected number is not sent twice.
 */
export function withFailover(
	primary: SmsSender,
	fallback: SmsSender,
): SmsSender {
	return {
		async send(message) {
			try {
				return await primary.send(message);
			} catch (error) {
				if (error instanceof SmsPermanentError) throw error;
				return fallback.send(message);
			}
		},
	};
}
