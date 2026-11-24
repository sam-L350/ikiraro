import { endpoints } from "../.generated/endpoints";
import { createRuntime } from "./core/api/runtime";
import { googleAuthRoutes } from "./core/auth/google";
import { smsWebhookRoutes } from "./core/sms/webhook";
import { getPrivateMedia, putPrivateMedia } from "./core/storage/media-http";

/**
 * Assembles the HTTP application:
 *
 * - `endpoints`  — generated from `src/api/**` (typed RPC, OpenAPI, client).
 *   Follow-ups at 30, 90, and 180 days are included.
 * - `rawRoutes`  — explicit routes for things that are not JSON function calls
 * - `onError`    — hook unexpected failures into your error tracker
 */
export function createApp() {
	return createRuntime({
		endpoints,
		rawRoutes: [
			...googleAuthRoutes,
			...smsWebhookRoutes,
			{
				method: "PUT",
				path: "/api/media/upload",
				handler: putPrivateMedia,
			},
			{
				method: "GET",
				path: "/api/media/file",
				handler: getPrivateMedia,
			},
		],
		onError(error, context) {
			context.logger.error("request failed", {
				error,
				path: context.url.pathname,
			});
		},
	});
}

export type App = ReturnType<typeof createApp>;
