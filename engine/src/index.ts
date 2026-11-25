/**
 * Bun entry point. Cloudflare Workers use `src/worker.ts` instead.
 *
 * Note: this file intentionally has no default export. Bun auto-serves a
 * default export that looks like a server config, which would start a second
 * server on the same port.
 */
import { createApp } from "./app";
import { env } from "./config/env";
import { askDueFollowUps } from "./core/hardware/follow-ups";
import { createStaticHandler, isEnginePath } from "./core/http/static";
import { dropExpiredImages } from "./core/identity/retention";
import { escalateOverdue } from "./core/learning/sla";
import { logger } from "./core/logger";
import { drainNotifications } from "./core/notifications/drain";
import { sendDueWebhooks } from "./core/partners/webhooks";
import { sendDueReports } from "./core/reports/reports";
import { getObjectStore } from "./core/storage/object-store";
import { db } from "./db";

const app = createApp();

// One-container hosting: when WEB_DIST_DIR points at the built web app, this
// process serves it on the same origin as the API (see docs/HOSTING.md).
const webDistDir = process.env.WEB_DIST_DIR?.trim();
const serveWeb = webDistDir ? createStaticHandler(webDistDir) : undefined;

const server = Bun.serve({
	port: env.port,
	hostname: env.hostname,
	development: !env.isProduction,
	maxRequestBodySize: Math.max(env.maxBodyBytes * 4, 11 * 1024 * 1024),
	fetch: serveWeb
		? (request) => {
				const isRead = request.method === "GET" || request.method === "HEAD";
				if (isRead && !isEnginePath(new URL(request.url).pathname)) {
					return serveWeb(request);
				}
				return app.fetch(request);
			}
		: app.fetch,
	error: app.error,
});

logger.info(
	`${env.appName} listening on http://${server.hostname}:${server.port}`,
	{
		environment: env.appEnv,
		docs: `${env.apiUrl}/openapi.json`,
	},
);

let draining = false;
const drainTimer = setInterval(() => {
	if (draining) return;
	draining = true;
	escalateOverdue(db)
		.catch((error: unknown) => {
			logger.error("review escalation failed", { error });
		})
		.then(() => askDueFollowUps(db))
		.catch((error: unknown) => {
			logger.error("follow-up check failed", { error });
		})
		.then(() => sendDueReports(db))
		.catch((error: unknown) => {
			logger.error("scheduled report failed", { error });
		})
		.then(() => sendDueWebhooks(db))
		.catch((error: unknown) => {
			logger.error("partner notice failed", { error });
		})
		.then(() => dropExpiredImages(db, getObjectStore()))
		.catch((error: unknown) => {
			logger.error("evidence retention failed", { error });
		})
		.then(() => drainNotifications(db))
		.catch((error: unknown) => {
			logger.error("notification drain failed", { error });
		})
		.finally(() => {
			draining = false;
		});
}, 15_000);

function shutdown(signal: string) {
	logger.info(`received ${signal}, shutting down`);
	clearInterval(drainTimer);
	server.stop(true);
	process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
