import { endpoints } from "../.generated/endpoints";
import { createRuntime } from "./core/api/runtime";
import { googleAuthRoutes } from "./core/auth/google";
import { smsWebhookRoutes } from "./core/sms/webhook";
import { getPrivateMedia, putPrivateMedia } from "./core/storage/media-http";

/**
 * Assembles the HTTP application:
 *
 * - `endpoints`  — generated from `src/api/**` (typed RPC, OpenAPI, client).
 *   A pathway is an ordered list of courses. A short check suggests where to start.
 *   A task question waits for a trainer. Group credit records what each person did. A sample is not evidence.
 *   A scheduled report emails donor totals. A warning names who has gone quiet or which center's backlog grew.
 *   A badge can expire. Its Open Badges file leaves the email out. A software licence has seats and an end date.
 *   A pop-up tour sends people back to a home center. A sector with no center is listed with the learners who name it. A template becomes a draft when an author uses it.
 *   A learner can send a voice note and pin three pieces of work. A trainer can decide several waiting items at once. A repair and a warranty sit on an item. A short pulse follows a first badge or a review. A partner address hears when a credential or a grant happens.
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
