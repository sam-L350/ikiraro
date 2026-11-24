import { describe, expect, test } from "bun:test";
import { sessionIsOpen } from "./center-sessions";

const start = new Date("2026-11-24T09:00:00.000Z");

describe("sessionIsOpen", () => {
	test("attendance is only open from the start through the last minute", () => {
		expect(sessionIsOpen(start, 60, new Date("2026-11-24T08:59:59.000Z"))).toBe(
			false,
		);
		expect(sessionIsOpen(start, 60, start)).toBe(true);
		expect(sessionIsOpen(start, 60, new Date("2026-11-24T10:00:00.000Z"))).toBe(
			true,
		);
		expect(sessionIsOpen(start, 60, new Date("2026-11-24T10:00:01.000Z"))).toBe(
			false,
		);
	});
});
