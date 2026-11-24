import { describe, expect, test } from "bun:test";
import { isApiError } from "../api/error";
import { assignRanks, parseFormula, rankScore } from "./formula";

const weights = {
	points: 2,
	badges: 0,
	hours: 0,
	attendance: 0,
	months: 0,
};

describe("grant formula", () => {
	test("the score uses the weights that were written, and a tie follows that choice", () => {
		expect(parseFormula({})).toBeNull();
		const formula = parseFormula({
			weights,
			tieBreak: "none",
			onePerHousehold: false,
			blockActiveGrant: false,
		});
		expect(formula?.quota).toBeUndefined();
		expect(formula?.onePerHousehold).toBe(false);
		expect(
			rankScore(
				{ points: 5, badges: 4, hours: 3, attendance: 2, months: 1 },
				weights,
			),
		).toBe(10);
		const shared = assignRanks(
			[
				{ id: "a", score: 10, at: 2 },
				{ id: "b", score: 10, at: 1 },
				{ id: "c", score: 4, at: 3 },
			],
			"none",
		);
		expect(shared.map((row) => [row.id, row.rank])).toEqual([
			["a", 1],
			["b", 1],
			["c", 3],
		]);
		const earlier = assignRanks(
			[
				{ id: "a", score: 10, at: 2 },
				{ id: "b", score: 10, at: 1 },
			],
			"earlier_application",
		);
		expect(earlier.map((row) => [row.id, row.rank])).toEqual([
			["b", 1],
			["a", 2],
		]);
	});

	test("a weight left out is refused instead of treated as zero", () => {
		try {
			parseFormula({
				weights: { points: 1 },
				tieBreak: "none",
				onePerHousehold: true,
				blockActiveGrant: false,
			});
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(400);
			return;
		}
		throw new Error("expected a refusal");
	});
});
