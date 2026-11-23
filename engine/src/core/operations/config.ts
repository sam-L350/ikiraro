import { desc, eq } from "drizzle-orm";
import type { Database } from "../../db";
import { configSettings, type JsonValue } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { SHARED_IDLE_KEY } from "../auth/shared-idle";
import { SMS_DAILY_CAP_KEY } from "../sms/cap";
import { MEDIA_MAX_KEY } from "../storage/limits";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

type ConfigDb = Pick<Database, "insert" | "select" | "transaction">;

export type ConfigSetting = {
	key: string;
	version: number;
	value: number | string;
	editable: boolean;
};

type KnownKey =
	| typeof SHARED_IDLE_KEY
	| typeof MEDIA_MAX_KEY
	| typeof SMS_DAILY_CAP_KEY;

function isKnownKey(key: string): key is KnownKey {
	switch (key) {
		case SHARED_IDLE_KEY:
		case MEDIA_MAX_KEY:
		case SMS_DAILY_CAP_KEY:
			return true;
		default:
			return false;
	}
}

function inRange(value: number, min: number, max: number): number {
	if (!Number.isInteger(value) || value < min || value > max) {
		throw errors.badRequest("That value is outside the allowed range.", {
			reason: "value",
		});
	}
	return value;
}

/** A number the existing readers will actually use. Unknown keys stay as they are. */
export function acceptedConfigValue(key: string, value: number): number {
	if (!isKnownKey(key)) {
		throw errors.badRequest("That setting cannot be changed here.", {
			reason: "key",
		});
	}
	switch (key) {
		case SHARED_IDLE_KEY:
			return inRange(value, 60_000, DAY_MS);
		case MEDIA_MAX_KEY:
			return inRange(value, 1024, MAX_MEDIA_BYTES);
		case SMS_DAILY_CAP_KEY:
			return inRange(value, 0, 100);
		default: {
			const unreachable: never = key;
			return unreachable;
		}
	}
}

function present(row: {
	key: string;
	version: number;
	value: JsonValue;
}): ConfigSetting {
	if (typeof row.value === "number" && isKnownKey(row.key)) {
		return {
			key: row.key,
			version: row.version,
			value: row.value,
			editable: true,
		};
	}
	return {
		key: row.key,
		version: row.version,
		value: JSON.stringify(row.value),
		editable: false,
	};
}

/** Newest row for each key already stored. */
export async function listSettings(
	database: ConfigDb,
): Promise<ConfigSetting[]> {
	const rows = await database
		.select({
			key: configSettings.key,
			version: configSettings.version,
			value: configSettings.value,
		})
		.from(configSettings)
		.orderBy(desc(configSettings.version));
	const seen = new Set<string>();
	const latest: ConfigSetting[] = [];
	for (const row of rows) {
		if (seen.has(row.key)) continue;
		seen.add(row.key);
		latest.push(present(row));
	}
	latest.sort((left, right) => left.key.localeCompare(right.key));
	return latest;
}

/** Write the next version when the number changed. The same number keeps the current row. */
export async function updateSetting(
	database: ConfigDb,
	input: { key: string; value: number; actorId: number; ip: string },
): Promise<ConfigSetting> {
	const next = acceptedConfigValue(input.key, input.value);
	const [current] = await database
		.select({
			key: configSettings.key,
			version: configSettings.version,
			value: configSettings.value,
		})
		.from(configSettings)
		.where(eq(configSettings.key, input.key))
		.orderBy(desc(configSettings.version))
		.limit(1);
	if (!current) {
		throw errors.notFound("That setting is not on record.");
	}
	if (current.value === next) return present(current);
	const version = current.version + 1;
	await database.transaction(async (tx) => {
		await tx.insert(configSettings).values({
			key: input.key,
			value: next,
			version,
		});
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "config.updated",
			targetType: "config_setting",
			targetId: input.key,
			ipAddress: input.ip,
			metadata: {
				version,
				previousVersion: current.version,
			},
		});
	});
	return { key: input.key, version, value: next, editable: true };
}
