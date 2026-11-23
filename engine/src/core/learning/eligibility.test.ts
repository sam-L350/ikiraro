import { describe, expect, test } from "bun:test";
import { type EligibilityUser, evaluateEligibility } from "./eligibility";

const district = "11111111-1111-4111-8111-111111111111";
const otherDistrict = "22222222-2222-4222-8222-222222222222";
const badge = "33333333-3333-4333-8333-333333333333";
const otherBadge = "44444444-4444-4444-8444-444444444444";

function user(overrides: Partial<EligibilityUser> = {}): EligibilityUser {
	return {
		points: 20,
		badgeIds: [badge],
		verifiedMinutes: 180,
		districtId: district,
		registeredAt: new Date(Date.UTC(2025, 0, 15)),
		asOf: new Date(Date.UTC(2025, 3, 15)),
		...overrides,
	};
}

describe("evaluateEligibility", () => {
	test("each criterion returns its own pass or fail", () => {
		const results = evaluateEligibility(user(), [
			{ kind: "points", minimum: 20 },
			{ kind: "points", minimum: 21 },
			{ kind: "badges", minimum: 1 },
			{ kind: "badges", minimum: 2 },
			{ kind: "badges", badgeId: badge },
			{ kind: "badges", badgeId: otherBadge },
			{ kind: "hours", minimum: 3 },
			{ kind: "hours", minimum: 4 },
			{ kind: "district", districtId: district },
			{ kind: "district", districtId: otherDistrict },
			{ kind: "months_active", minimum: 3 },
			{ kind: "months_active", minimum: 4 },
		]);
		expect(results.map((result) => result.status)).toEqual([
			"pass",
			"fail",
			"pass",
			"fail",
			"pass",
			"fail",
			"pass",
			"fail",
			"pass",
			"fail",
			"pass",
			"fail",
		]);
		expect(results[1]?.reason).toBe("Points are below the minimum.");
		expect(results[5]?.reason).toBe("That badge has not been awarded.");
		expect(results[9]?.reason).toBe("The learner is outside this district.");
		expect(results[11]?.reason).toBe("Months active are below the minimum.");
	});

	test("hours use whole hours from verified minutes, and badges count once", () => {
		const results = evaluateEligibility(
			user({
				verifiedMinutes: 119,
				badgeIds: [badge, badge, otherBadge],
			}),
			[
				{ kind: "hours", minimum: 1 },
				{ kind: "hours", minimum: 2 },
				{ kind: "badges", minimum: 2 },
				{ kind: "badges", minimum: 3 },
			],
		);
		expect(results.map((result) => result.status)).toEqual([
			"pass",
			"fail",
			"pass",
			"fail",
		]);
	});

	test("a missing district fails, and a day short of the month does not count", () => {
		const results = evaluateEligibility(
			user({
				districtId: null,
				asOf: new Date(Date.UTC(2025, 3, 14)),
			}),
			[
				{ kind: "district", districtId: district },
				{ kind: "months_active", minimum: 3 },
			],
		);
		expect(results[0]?.status).toBe("fail");
		expect(results[0]?.reason).toBe("The learner has no district.");
		expect(results[1]?.status).toBe("fail");
		expect(results[1]?.reason).toBe("Months active are below the minimum.");
	});

	test("attendance is not a pass or a fail until sessions exist", () => {
		const results = evaluateEligibility(user(), [
			{ kind: "points", minimum: 0 },
			{ kind: "attendance", minimum: 1 },
			{ kind: "hours", minimum: 0 },
		]);
		expect(results.map((result) => [result.kind, result.status])).toEqual([
			["points", "pass"],
			["attendance", "unknown"],
			["hours", "pass"],
		]);
		expect(results[1]?.reason).toBe("Not enough data.");
	});

	test("no criteria returns no results", () => {
		expect(evaluateEligibility(user(), [])).toEqual([]);
	});
});
