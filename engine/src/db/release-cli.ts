/**
 * Release step for a container deployment. Runs before the server starts:
 * applies pending migrations from `engine/drizzle`, then stores the roles,
 * permissions and geography every environment needs. Both are safe to re-run.
 */
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../config/env";
import { logger } from "../core/logger";
import { seedFoundations } from "./seed";

const url = env.databaseUrl;
if (!url) {
	throw new Error("DATABASE_URL is required to run the release step.");
}

const client = postgres(url, { max: 1, connect_timeout: 15, onnotice() {} });
try {
	await migrate(drizzle({ client }), {
		migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
	});
	logger.info("release: migrations are up to date");
} finally {
	await client.end();
}

await seedFoundations();
logger.info("release: foundations are in place");

// The shared pool keeps the process alive for its idle timeout otherwise.
process.exit(0);
