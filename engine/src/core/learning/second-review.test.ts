import { describe, expect, test } from "bun:test";
import {
	isFastRise,
	isSingleReviewer,
	overseesTrainers,
	percent,
	shouldSample,
	summarizeQuality,
} from "./second-review";

describe("second review sampling", () => {
	test("a new trainer is sampled more often than a later one", () => {
		const shared = { every: 5, newEvery: 2, newUntil: 10 };
		expect(shouldSample({ ...shared, priorApprovals: 0 })).toBe(true);
		expect(shouldSample({ ...shared, priorApprovals: 1 })).toBe(false);
		expect(shouldSample({ ...shared, priorApprovals: 2 })).toBe(true);
		expect(shouldSample({ ...shared, priorApprovals: 8 })).toBe(true);
		expect(shouldSample({ ...shared, priorApprovals: 9 })).toBe(false);
		expect(shouldSample({ ...shared, priorApprovals: 10 })).toBe(true);
		expect(shouldSample({ ...shared, priorApprovals: 11 })).toBe(false);
		expect(shouldSample({ ...shared, priorApprovals: 15 })).toBe(true);
	});

	test("a wider new-trainer step never samples less often than the ordinary step", () => {
		expect(
			shouldSample({
				priorApprovals: 1,
				every: 2,
				newEvery: 8,
				newUntil: 10,
			}),
		).toBe(false);
		expect(
			shouldSample({
				priorApprovals: 2,
				every: 2,
				newEvery: 8,
				newUntil: 10,
			}),
		).toBe(true);
	});
});

describe("trainer quality", () => {
	test("rates use decisions and closed second readings", () => {
		const row = summarizeQuality({
			userId: 4,
			name: "Ama",
			decisions: [
				{ decision: "approved", reviewSeconds: 600, reason: null },
				{ decision: "needs_revision", reviewSeconds: 1200, reason: null },
				{ decision: "rejected", reviewSeconds: null, reason: "incomplete" },
				{ decision: "approved", reviewSeconds: 600, reason: null },
			],
			secondReviews: ["agreed", "disagreed"],
		});
		expect(row.decisions).toBe(4);
		expect(row.approvalRate).toBe(50);
		expect(row.reworkRate).toBe(25);
		expect(row.medianReviewMinutes).toBe(10);
		expect(row.disagreementRate).toBe(50);
		expect(row.rejectionReasons).toEqual([{ reason: "incomplete", count: 1 }]);
		expect(percent(1, 0)).toBeNull();
	});

	test("an empty record has no rates", () => {
		const row = summarizeQuality({
			userId: 4,
			name: "Ama",
			decisions: [],
			secondReviews: [],
		});
		expect(row.approvalRate).toBeNull();
		expect(row.reworkRate).toBeNull();
		expect(row.medianReviewMinutes).toBeNull();
		expect(row.disagreementRate).toBeNull();
	});

	test("a fast rise and a single reviewer are the two flags", () => {
		expect(isFastRise(101, 100)).toBe(true);
		expect(isFastRise(100, 100)).toBe(false);
		expect(isSingleReviewer({ approvals: 3, reviewers: 1, minimum: 3 })).toBe(
			true,
		);
		expect(isSingleReviewer({ approvals: 3, reviewers: 2, minimum: 3 })).toBe(
			false,
		);
		expect(isSingleReviewer({ approvals: 2, reviewers: 1, minimum: 3 })).toBe(
			false,
		);
	});

	test("a trainer does not oversee other trainers", () => {
		expect(overseesTrainers(["trainer"])).toBe(false);
		expect(overseesTrainers(["center_manager"])).toBe(true);
		expect(overseesTrainers(["district_coordinator"])).toBe(true);
		expect(overseesTrainers(["platform_admin"])).toBe(true);
	});
});
