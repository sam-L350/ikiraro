/**
 * A snapshot of one learner. The caller reads the ledger and the passport
 * first, so this function does not touch the database.
 */
export type EligibilityUser = {
	points: number;
	/** Badges the learner still holds. A revoked badge is left out. */
	badgeIds: readonly string[];
	verifiedMinutes: number;
	/**
	 * Sessions this learner was marked present for. Leave it out when the
	 * caller has not loaded attendance, and the criterion stays unknown.
	 */
	attendedSessions?: number;
	districtId: string | null;
	registeredAt: Date;
	/** The moment of the check. Months active are counted up to this instant. */
	asOf: Date;
};

export type EligibilityCriterion =
	| { kind: "points"; minimum: number }
	| { kind: "badges"; minimum?: number; badgeId?: string }
	| { kind: "hours"; minimum: number }
	| { kind: "attendance"; minimum: number }
	| { kind: "district"; districtId: string }
	| { kind: "months_active"; minimum: number };

export type EligibilityStatus = "pass" | "fail" | "unknown";

export type EligibilityOutcome = {
	kind: EligibilityCriterion["kind"];
	status: EligibilityStatus;
	reason: string;
};

const NOT_ENOUGH_DATA = "Not enough data.";

function isMinimum(value: number): boolean {
	return Number.isInteger(value) && value >= 0;
}

function verifiedHours(minutes: number): number {
	if (!Number.isFinite(minutes) || minutes <= 0) return 0;
	return Math.floor(minutes / 60);
}

function wholeMonths(from: Date, to: Date): number | null {
	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
	let months =
		(to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
		(to.getUTCMonth() - from.getUTCMonth());
	if (to.getUTCDate() < from.getUTCDate()) months -= 1;
	return Math.max(0, months);
}

function outcome(
	kind: EligibilityCriterion["kind"],
	status: EligibilityStatus,
	reason: string,
): EligibilityOutcome {
	return { kind, status, reason };
}

function evaluateOne(
	user: EligibilityUser,
	criterion: EligibilityCriterion,
): EligibilityOutcome {
	switch (criterion.kind) {
		case "points": {
			if (!isMinimum(criterion.minimum) || !Number.isFinite(user.points)) {
				return outcome("points", "fail", "That points rule is not usable.");
			}
			if (user.points >= criterion.minimum) {
				return outcome("points", "pass", "Points meet the minimum.");
			}
			return outcome("points", "fail", "Points are below the minimum.");
		}
		case "badges": {
			const held = new Set(user.badgeIds);
			const count = held.size;
			const wantsBadge = criterion.badgeId !== undefined;
			const wantsCount = criterion.minimum !== undefined;
			if (!wantsBadge && !wantsCount) {
				return outcome("badges", "fail", "That badge rule is not usable.");
			}
			if (wantsCount && !isMinimum(criterion.minimum ?? -1)) {
				return outcome("badges", "fail", "That badge rule is not usable.");
			}
			if (wantsBadge && criterion.badgeId === "") {
				return outcome("badges", "fail", "That badge rule is not usable.");
			}
			if (wantsBadge && criterion.badgeId && !held.has(criterion.badgeId)) {
				return outcome("badges", "fail", "That badge has not been awarded.");
			}
			if (wantsCount && count < (criterion.minimum ?? 0)) {
				return outcome("badges", "fail", "Badges are below the minimum.");
			}
			return outcome("badges", "pass", "Badges meet the rule.");
		}
		case "hours": {
			if (!isMinimum(criterion.minimum)) {
				return outcome("hours", "fail", "That hours rule is not usable.");
			}
			if (verifiedHours(user.verifiedMinutes) >= criterion.minimum) {
				return outcome("hours", "pass", "Hours meet the minimum.");
			}
			return outcome("hours", "fail", "Hours are below the minimum.");
		}
		case "attendance": {
			if (!isMinimum(criterion.minimum)) {
				return outcome(
					"attendance",
					"fail",
					"That attendance rule is not usable.",
				);
			}
			if (user.attendedSessions === undefined) {
				return outcome("attendance", "unknown", NOT_ENOUGH_DATA);
			}
			if (
				!Number.isInteger(user.attendedSessions) ||
				user.attendedSessions < 0
			) {
				return outcome(
					"attendance",
					"fail",
					"That attendance count is not usable.",
				);
			}
			if (user.attendedSessions >= criterion.minimum) {
				return outcome("attendance", "pass", "Attendance meets the minimum.");
			}
			return outcome("attendance", "fail", "Attendance is below the minimum.");
		}
		case "district": {
			if (criterion.districtId.trim() === "") {
				return outcome("district", "fail", "That district rule is not usable.");
			}
			if (user.districtId === null || user.districtId.trim() === "") {
				return outcome("district", "fail", "The learner has no district.");
			}
			if (user.districtId === criterion.districtId) {
				return outcome("district", "pass", "The learner is in this district.");
			}
			return outcome(
				"district",
				"fail",
				"The learner is outside this district.",
			);
		}
		case "months_active": {
			if (!isMinimum(criterion.minimum)) {
				return outcome(
					"months_active",
					"fail",
					"That months rule is not usable.",
				);
			}
			const months = wholeMonths(user.registeredAt, user.asOf);
			if (months === null) {
				return outcome(
					"months_active",
					"fail",
					"The registration date is not usable.",
				);
			}
			if (months >= criterion.minimum) {
				return outcome(
					"months_active",
					"pass",
					"Months active meet the minimum.",
				);
			}
			return outcome(
				"months_active",
				"fail",
				"Months active are below the minimum.",
			);
		}
		default: {
			const unreachable: never = criterion;
			return unreachable;
		}
	}
}

/** One result per criterion, in the same order. Attendance stays unknown until a count is supplied. */
export function evaluateEligibility(
	user: EligibilityUser,
	criteria: readonly EligibilityCriterion[],
): EligibilityOutcome[] {
	return criteria.map((criterion) => evaluateOne(user, criterion));
}
