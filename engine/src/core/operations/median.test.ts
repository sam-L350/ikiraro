import { describe, expect, test } from "bun:test";
import { medianMinutes } from "./median";

describe("median review minutes", () => {
	test("an empty list has no median", () => {
		expect(medianMinutes([])).toBeNull();
	});

	test("one decision is that duration", () => {
		expect(medianMinutes([60])).toBe(1);
	});

	test("an even count averages the two middle durations", () => {
		expect(medianMinutes([60, 180])).toBe(2);
	});

	test("a negative duration is left out", () => {
		expect(medianMinutes([-30, 120, 240])).toBe(3);
	});
});
