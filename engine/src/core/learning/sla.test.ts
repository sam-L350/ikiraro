import { describe, expect, test } from "bun:test";
import {
	DEFAULT_REVIEW_SLA_MS,
	nextEscalation,
	pickReviewSlaMs,
	reviewUrgency,
} from "./sla";

const now = new Date("2026-11-23T12:00:00.000Z");

describe("review deadline", () => {
	test("the last twelve hours are due soon, and the deadline is overdue", () => {
		expect(reviewUrgency(new Date("2026-11-24T12:00:00.000Z"), now)).toBe("ok");
		expect(reviewUrgency(new Date("2026-11-23T20:00:00.000Z"), now)).toBe(
			"soon",
		);
		expect(reviewUrgency(now, now)).toBe("overdue");
	});

	test("a missing setting stays at 72 hours", () => {
		expect(pickReviewSlaMs(undefined)).toBe(DEFAULT_REVIEW_SLA_MS);
		expect(pickReviewSlaMs(DEFAULT_REVIEW_SLA_MS)).toBe(DEFAULT_REVIEW_SLA_MS);
	});

	test("the center manager is first, and the district follows one more window", () => {
		const due = new Date(now.getTime() - 60_000);
		expect(
			nextEscalation({
				stage: "none",
				dueAt: due,
				now,
				slaMs: DEFAULT_REVIEW_SLA_MS,
			}),
		).toBe("manager");
		const late = new Date(due.getTime() - DEFAULT_REVIEW_SLA_MS);
		expect(
			nextEscalation({
				stage: "none",
				dueAt: late,
				now,
				slaMs: DEFAULT_REVIEW_SLA_MS,
			}),
		).toBe("district");
		expect(
			nextEscalation({
				stage: "manager",
				dueAt: late,
				now,
				slaMs: DEFAULT_REVIEW_SLA_MS,
			}),
		).toBe("district");
		expect(
			nextEscalation({
				stage: "district",
				dueAt: late,
				now,
				slaMs: DEFAULT_REVIEW_SLA_MS,
			}),
		).toBeNull();
	});
});
