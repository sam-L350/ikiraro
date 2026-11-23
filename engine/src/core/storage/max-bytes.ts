import { eq } from "drizzle-orm";
import type { Database } from "../../db";
import { configSettings } from "../../db/schema";
import { MEDIA_MAX_KEY, pickMaxBytes } from "./limits";

type MaxRow = { version: number; value: unknown };

/** The newest configured door wins. A missing or unusable value stays at 10 MB. */
export function newestMaxBytes(rows: readonly MaxRow[]): number {
	let latest: MaxRow | undefined;
	for (const row of rows) {
		if (!latest || row.version >= latest.version) latest = row;
	}
	return pickMaxBytes(latest?.value);
}

export async function readMaxBytes(
	database: Pick<Database, "select">,
): Promise<number> {
	const rows = await database
		.select({ version: configSettings.version, value: configSettings.value })
		.from(configSettings)
		.where(eq(configSettings.key, MEDIA_MAX_KEY));
	return newestMaxBytes(rows);
}
