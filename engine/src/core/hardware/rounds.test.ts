import { describe, expect, test } from "bun:test";
import { applicationPasses } from "./rounds";

describe("applicationPasses", () => {
	test("an empty rule list passes, and one miss blocks the application", () => {
		expect(applicationPasses([])).toBe(true);
		expect(
			applicationPasses([
				{ kind: "points", status: "pass", reason: "Points meet the minimum." },
			]),
		).toBe(true);
		expect(
			applicationPasses([
				{
					kind: "points",
					status: "fail",
					reason: "Points are below the minimum.",
				},
			]),
		).toBe(false);
		expect(
			applicationPasses([
				{ kind: "attendance", status: "unknown", reason: "Not enough data." },
			]),
		).toBe(false);
	});
});
