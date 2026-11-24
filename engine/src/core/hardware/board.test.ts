import { describe, expect, test } from "bun:test";
import { ageBand, boardInitials, progressToward, visibleGroups } from "./board";

describe("leaderboard display", () => {
	test("initials replace the name, and a missing name is not an email", () => {
		expect(boardInitials("Ada Keza")).toBe("AK");
		expect(boardInitials("  ada   keza  umu  extra ")).toBe("AKU");
		expect(boardInitials(null)).toBeNull();
		expect(boardInitials("   ")).toBeNull();
	});

	test("progress uses the stored minimum and stops at the threshold", () => {
		expect(progressToward(5, 10)).toBe(50);
		expect(progressToward(25, 10)).toBe(100);
		expect(progressToward(5, null)).toBeNull();
		expect(progressToward(5, 0)).toBeNull();
	});

	test("age bands are reporting groups, and a small group is hidden", () => {
		const today = new Date("2026-11-24T00:00:00.000Z");
		expect(ageBand("2010-01-01", today)).toBe("under 18");
		expect(ageBand("2005-06-01", today)).toBe("18-24");
		expect(ageBand("1998-01-01", today)).toBe("25-34");
		expect(ageBand("1980-01-01", today)).toBe("35 and over");
		expect(ageBand(null, today)).toBeNull();
		expect(
			visibleGroups([
				{ label: "woman", registered: 10 },
				{ label: "man", registered: 9 },
			]).map((row) => row.label),
		).toEqual(["woman"]);
	});
});
