import type { JsonValue } from "../../db/schema";

export type FlagRow = {
	key: string;
	version: number;
	value: JsonValue;
};

/** The highest version wins. Missing keys are off. */
export function readLatestFlag(rows: readonly FlagRow[], key: string): boolean {
	let latest: FlagRow | undefined;
	for (const row of rows) {
		if (row.key !== key) continue;
		if (!latest || row.version >= latest.version) latest = row;
	}
	if (!latest) return false;
	if (typeof latest.value === "boolean") return latest.value;
	if (
		latest.value !== null &&
		typeof latest.value === "object" &&
		!Array.isArray(latest.value) &&
		latest.value.enabled === true
	) {
		return true;
	}
	return false;
}
