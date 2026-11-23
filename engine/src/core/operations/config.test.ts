import { describe, expect, test } from "bun:test";
import { isApiError } from "../api/error";
import { SHARED_IDLE_KEY } from "../auth/shared-idle";
import { REVIEW_SLA_KEY } from "../learning/sla";
import { SMS_DAILY_CAP_KEY } from "../sms/cap";
import { MEDIA_MAX_KEY } from "../storage/limits";
import { acceptedConfigValue } from "./config";

function statusOf(run: () => void): number {
	try {
		run();
		return 0;
	} catch (error) {
		if (!isApiError(error)) throw error;
		return error.status;
	}
}

describe("config values", () => {
	test("a shared-device idle time stays between one minute and one day", () => {
		expect(acceptedConfigValue(SHARED_IDLE_KEY, 60_000)).toBe(60_000);
		expect(statusOf(() => acceptedConfigValue(SHARED_IDLE_KEY, 59_999))).toBe(
			400,
		);
	});

	test("a file limit stays inside the range the upload door already uses", () => {
		expect(acceptedConfigValue(MEDIA_MAX_KEY, 1024)).toBe(1024);
		expect(statusOf(() => acceptedConfigValue(MEDIA_MAX_KEY, 1023))).toBe(400);
	});

	test("a daily text cap is a whole number from zero to one hundred", () => {
		expect(acceptedConfigValue(SMS_DAILY_CAP_KEY, 0)).toBe(0);
		expect(acceptedConfigValue(SMS_DAILY_CAP_KEY, 8)).toBe(8);
		expect(statusOf(() => acceptedConfigValue(SMS_DAILY_CAP_KEY, 101))).toBe(
			400,
		);
	});

	test("a review window stays between one hour and fourteen days", () => {
		expect(acceptedConfigValue(REVIEW_SLA_KEY, 72 * 60 * 60 * 1000)).toBe(
			72 * 60 * 60 * 1000,
		);
		expect(statusOf(() => acceptedConfigValue(REVIEW_SLA_KEY, 60_000))).toBe(
			400,
		);
	});

	test("a key this screen does not know is refused", () => {
		expect(statusOf(() => acceptedConfigValue("feature.unknown", 1))).toBe(400);
	});
});
