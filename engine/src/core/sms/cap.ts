import { and, eq, gte, isNotNull, lt, ne } from "drizzle-orm";
import { env } from "../../config/env";
import type { Database } from "../../db";
import { configSettings, type JsonValue, smsCharges } from "../../db/schema";

export const SMS_DAILY_CAP_KEY = "sms.daily_cap";
export const DEFAULT_SMS_DAILY_CAP = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

type CapRow = { version: number; value: JsonValue };

/** The newest non-negative integer wins. A missing row keeps the default. */
export function pickDailyCap(
	rows: readonly CapRow[],
	fallback = DEFAULT_SMS_DAILY_CAP,
): number {
	let latest: CapRow | undefined;
	for (const row of rows) {
		if (!latest || row.version >= latest.version) latest = row;
	}
	if (
		latest &&
		typeof latest.value === "number" &&
		Number.isInteger(latest.value) &&
		latest.value >= 0
	) {
		return latest.value;
	}
	return fallback;
}

/** Africa/Kigali has no daylight saving. The day starts at 00:00 UTC+2. */
export function kigaliDayWindow(now: Date): { start: Date; end: Date } {
	const day = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Africa/Kigali",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	const start = new Date(`${day}T00:00:00+02:00`);
	return { start, end: new Date(start.getTime() + DAY_MS) };
}

export async function readDailyCap(
	database: Pick<Database, "select">,
): Promise<number> {
	const rows = await database
		.select({ version: configSettings.version, value: configSettings.value })
		.from(configSettings)
		.where(eq(configSettings.key, SMS_DAILY_CAP_KEY));
	return pickDailyCap(rows, env.sms.dailyCap);
}

/** Notification texts accepted today. A one-time code is not counted. */
export async function notificationSmsToday(
	database: Pick<Database, "select">,
	userId: number,
	now: Date,
	cap: number,
): Promise<number> {
	if (cap <= 0) return 0;
	const window = kigaliDayWindow(now);
	const rows = await database
		.select({ id: smsCharges.id })
		.from(smsCharges)
		.where(
			and(
				eq(smsCharges.userId, userId),
				isNotNull(smsCharges.notificationId),
				ne(smsCharges.status, "failed"),
				gte(smsCharges.createdAt, window.start),
				lt(smsCharges.createdAt, window.end),
			),
		)
		.limit(cap);
	return rows.length;
}
