/** Middle value, in whole minutes. An empty list has no median. */
export function medianMinutes(seconds: readonly number[]): number | null {
	const usable = seconds.filter(
		(value) => Number.isFinite(value) && value >= 0,
	);
	if (usable.length === 0) return null;
	const sorted = [...usable].sort((left, right) => left - right);
	const mid = Math.floor(sorted.length / 2);
	const middle =
		sorted.length % 2 === 1
			? sorted[mid]
			: ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
	if (middle === undefined) return null;
	return Math.round(middle / 60);
}
