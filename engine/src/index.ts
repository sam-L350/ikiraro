/**
 * Bun entry point. Cloudflare Workers use `src/worker.ts` instead.
 *
 * Note: this file intentionally has no default export. Bun auto-serves a
 * default export that looks like a server config, which would start a second
 * server on the same port.
 */
import { createApp } from "./app";
import { env } from "./config/env";
import { escalateOverdue } from "./core/learning/sla";
import { logger } from "./core/logger";
import { drainNotifications } from "./core/notifications/drain";
import { db } from "./db";

const app = createApp();

const server = Bun.serve({
	port: env.port,
	hostname: env.hostname,
	development: !env.isProduction,
	maxRequestBodySize: Math.max(env.maxBodyBytes * 4, 11 * 1024 * 1024),
	fetch: app.fetch,
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
