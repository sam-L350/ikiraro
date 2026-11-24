import { describe, expect, test } from "bun:test";
import { addDays } from "./follow-ups";

describe("follow-up dates", () => {
	test("30, 90, and 180 days are added to the award date", () => {
		expect(addDays("2026-01-01", 30)).toBe("2026-01-31");
		expect(addDays("2026-01-01", 90)).toBe("2026-04-01");
		expect(addDays("2026-01-01", 180)).toBe("2026-06-30");
	});
});
