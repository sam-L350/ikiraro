import { expect, test } from "bun:test";
import { isApiError } from "../api/error";
import { reviewConflict, weightedScore } from "./verifications";

test("a trainer cannot decide their own work or a declared relative", () => {
	expect(
		reviewConflict({
			reviewerId: 1,
			learnerId: 1,
			relationships: [],
		}),
	).toBe("self");
	expect(
		reviewConflict({
			reviewerId: 1,
			learnerId: 2,
			relationships: [{ userId: 1, relatedUserId: 2 }],
		}),
	).toBe("relative");
	expect(
		reviewConflict({
			reviewerId: 1,
			learnerId: 2,
			relationships: [{ userId: 2, relatedUserId: 1 }],
		}),
	).toBe("relative");
	expect(
		reviewConflict({
			reviewerId: 1,
			learnerId: 2,
			relationships: [{ userId: 1, relatedUserId: null }],
		}),
	).toBe("ok");
});

test("a score is the weighted percent of every rubric row", () => {
	expect(
		weightedScore(
			[
				{ id: "a", weight: 1 },
				{ id: "b", weight: 3 },
			],
			[
				{ criterionId: "a", score: 100 },
				{ criterionId: "b", score: 0 },
			],
		),
	).toBe(25);
	expect(weightedScore([], [])).toBeNull();
	try {
		weightedScore([{ id: "a", weight: 1 }], []);
		throw new Error("expected a missing score to fail");
	} catch (error) {
		expect(isApiError(error) && error.status).toBe(400);
	}
});
