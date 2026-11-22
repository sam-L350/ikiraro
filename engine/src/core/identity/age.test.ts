import { describe, expect, test } from "bun:test";
import { isUnder18, parseDateOfBirth } from "./age";

const today = new Date("2026-11-22T12:00:00Z");

describe("isUnder18", () => {
	test("a person who turns 18 today is an adult", () => {
		expect(isUnder18("2008-11-22", today)).toBe(false);
	});

	test("a person who turns 18 tomorrow is a minor", () => {
		expect(isUnder18("2008-11-23", today)).toBe(true);
	});

	test("a future date is rejected", () => {
		expect(() => parseDateOfBirth("2027-01-01", today)).toThrow();
	});
});
