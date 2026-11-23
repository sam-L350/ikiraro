import { errors } from "../api/error";

export type ScoredCriterion = {
	weight: number;
	passThreshold: number;
	score: number;
};

export function requirePassThreshold(value: number | undefined): number {
	const threshold = value ?? 100;
	if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) {
		throw errors.badRequest("Enter a pass mark from 1 to 100.", {
			reason: "invalid_threshold",
		});
	}
	return threshold;
}

function markInRange(value: number): boolean {
	return Number.isInteger(value) && value >= 0 && value <= 100;
}

/** Weighted percent, rounded. An empty rubric scores zero. */
export function weightedScore(criteria: ScoredCriterion[]): number {
	const total = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
	if (total <= 0) return 0;
	const earned = criteria.reduce(
		(sum, criterion) => sum + criterion.score * criterion.weight,
		0,
	);
	return Math.round(earned / total);
}

/** Every criterion meets its own mark, and the weighted total meets the task mark. */
export function rubricPasses(
	criteria: ScoredCriterion[],
	taskPassThreshold: number,
): boolean {
	if (criteria.length === 0) return false;
	const scored = criteria.every(
		(criterion) =>
			markInRange(criterion.score) &&
			markInRange(criterion.passThreshold) &&
			criterion.weight > 0 &&
			criterion.score >= criterion.passThreshold,
	);
	return scored && weightedScore(criteria) >= taskPassThreshold;
}
