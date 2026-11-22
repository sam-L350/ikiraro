import { describe, expect, test } from "bun:test";
import { readLatestFlag } from "./flags";
import { createMemoryIdempotencyStore, runIdempotent } from "./idempotency";
import {
	consumeRateLimit,
	resetRateLimits,
	resetTestClock,
	setTestClock,
} from "./rate-limit";

describe("runIdempotent", () => {
	test("the same key returns the stored result and does not run twice", async () => {
		const store = createMemoryIdempotencyStore();
		let runs = 0;
		const run = () => {
			runs += 1;
			return Promise.resolve({ n: runs });
		};
		const first = await runIdempotent({
			store,
			key: "award-1",
			route: "POST /verifications",
			actorKey: "user-4",
			run,
		});
		const second = await runIdempotent({
			store,
			key: "award-1",
			route: "POST /verifications",
			actorKey: "user-4",
			run,
		});
		expect(first).toEqual({ n: 1 });
		expect(second).toEqual({ n: 1 });
		expect(runs).toBe(1);
	});
});

describe("consumeRateLimit", () => {
	test("locks after the limit until the window moves", () => {
		resetRateLimits();
		setTestClock(() => 1_000);
		const key = "otp:250788000000";
		expect(consumeRateLimit({ key, limit: 2, windowMs: 1_000 }).ok).toBe(true);
		expect(consumeRateLimit({ key, limit: 2, windowMs: 1_000 }).ok).toBe(true);
		expect(consumeRateLimit({ key, limit: 2, windowMs: 1_000 }).ok).toBe(false);
		setTestClock(() => 2_100);
		expect(consumeRateLimit({ key, limit: 2, windowMs: 1_000 }).ok).toBe(true);
		resetTestClock();
		resetRateLimits();
	});
});

describe("readLatestFlag", () => {
	test("uses the highest version", () => {
		const enabled = readLatestFlag(
			[
				{ key: "pilot.nyagatare", version: 1, value: false },
				{ key: "pilot.nyagatare", version: 3, value: { enabled: true } },
				{ key: "pilot.nyagatare", version: 2, value: false },
			],
			"pilot.nyagatare",
		);
		expect(enabled).toBe(true);
		expect(readLatestFlag([], "pilot.nyagatare")).toBe(false);
	});
});
