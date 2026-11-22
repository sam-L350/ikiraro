import { eq } from "drizzle-orm";
import type { Database } from "../../db";
import { configSettings, type JsonValue } from "../../db/schema";

export const SHARED_IDLE_KEY = "session.shared_idle_ms";
export const DEFAULT_SHARED_IDLE_MS = 5 * 60 * 1000;

type IdleRow = { version: number; value: JsonValue };

/** The newest numeric setting wins. Anything missing or too small stays at five minutes. */
export function pickSharedIdleMs(rows: readonly IdleRow[]): number {
	let latest: IdleRow | undefined;
	for (const row of rows) {
		if (!latest || row.version >= latest.version) latest = row;
	}
	if (
		latest &&
		typeof latest.value === "number" &&
		Number.isFinite(latest.value) &&
		latest.value >= 60_000
	) {
		return latest.value;
	}
	return DEFAULT_SHARED_IDLE_MS;
}

export async function readSharedIdleMs(
	database: Pick<Database, "select">,
): Promise<number> {
	const rows = await database
		.select({
			version: configSettings.version,
			value: configSettings.value,
		})
		.from(configSettings)
		.where(eq(configSettings.key, SHARED_IDLE_KEY));
	return pickSharedIdleMs(rows);
}
