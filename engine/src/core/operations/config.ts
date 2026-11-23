import { desc, eq } from "drizzle-orm";
import type { Database } from "../../db";
import { configSettings, type JsonValue } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { SHARED_IDLE_KEY } from "../auth/shared-idle";
import {
	FAST_AMOUNT_KEY,
	FAST_AMOUNT_MAX,
	FAST_AMOUNT_MIN,
	FAST_DAYS_KEY,
	FAST_DAYS_MAX,
	FAST_DAYS_MIN,
	NEW_TRAINER_APPROVALS_KEY,
	NEW_TRAINER_MAX,
	NEW_TRAINER_MIN,
	SECOND_EVERY_KEY,
	SECOND_EVERY_MAX,
	SECOND_EVERY_MIN,
	SECOND_NEW_EVERY_KEY,
	SECOND_NEW_EVERY_MAX,
	SECOND_NEW_EVERY_MIN,
	SINGLE_REVIEWER_KEY,
	SINGLE_REVIEWER_MAX,
	SINGLE_REVIEWER_MIN,
} from "../learning/second-review";
import {
	MAX_REVIEW_SLA_MS,
	MIN_REVIEW_SLA_MS,
	REVIEW_SLA_KEY,
} from "../learning/sla";
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
	| typeof SMS_DAILY_CAP_KEY
	| typeof REVIEW_SLA_KEY
	| typeof SECOND_EVERY_KEY
	| typeof SECOND_NEW_EVERY_KEY
	| typeof NEW_TRAINER_APPROVALS_KEY
	| typeof FAST_DAYS_KEY
	| typeof FAST_AMOUNT_KEY
	| typeof SINGLE_REVIEWER_KEY;

function isKnownKey(key: string): key is KnownKey {
	switch (key) {
		case SHARED_IDLE_KEY:
		case MEDIA_MAX_KEY:
		case SMS_DAILY_CAP_KEY:
		case REVIEW_SLA_KEY:
		case SECOND_EVERY_KEY:
		case SECOND_NEW_EVERY_KEY:
		case NEW_TRAINER_APPROVALS_KEY:
		case FAST_DAYS_KEY:
		case FAST_AMOUNT_KEY:
		case SINGLE_REVIEWER_KEY:
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
		case REVIEW_SLA_KEY:
			return inRange(value, MIN_REVIEW_SLA_MS, MAX_REVIEW_SLA_MS);
		case SECOND_EVERY_KEY:
			return inRange(value, SECOND_EVERY_MIN, SECOND_EVERY_MAX);
		case SECOND_NEW_EVERY_KEY:
			return inRange(value, SECOND_NEW_EVERY_MIN, SECOND_NEW_EVERY_MAX);
		case NEW_TRAINER_APPROVALS_KEY:
			return inRange(value, NEW_TRAINER_MIN, NEW_TRAINER_MAX);
		case FAST_DAYS_KEY:
			return inRange(value, FAST_DAYS_MIN, FAST_DAYS_MAX);
		case FAST_AMOUNT_KEY:
			return inRange(value, FAST_AMOUNT_MIN, FAST_AMOUNT_MAX);
		case SINGLE_REVIEWER_KEY:
			return inRange(value, SINGLE_REVIEWER_MIN, SINGLE_REVIEWER_MAX);
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
