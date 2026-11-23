import type { BadgeRule } from "../../db/schema/content";
import { errors } from "../api/error";

export type BadgeProgress = {
	requiredTaskIds: string[];
	approvedTaskIds: string[];
	score: number | null;
	hours: number | null;
};

export function readBadgeRule(value: unknown): BadgeRule {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return {
			allRequiredTasksApproved: true,
			minimumScore: null,
			minimumHours: null,
		};
	}
	const record = value as Record<string, unknown>;
	return {
		allRequiredTasksApproved: record.allRequiredTasksApproved === true,
		minimumScore: optionalScore(record.minimumScore),
		minimumHours: optionalHours(record.minimumHours),
	};
}

function optionalScore(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isInteger(value)) return null;
	if (value < 0 || value > 100) return null;
	return value;
}

function optionalHours(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		return null;
	}
	return value;
}

export function requireLevel(value: number): number {
	if (!Number.isInteger(value) || value < 1) {
		throw errors.badRequest("Enter a badge level of 1 or more.", {
			reason: "invalid_level",
		});
	}
	return value;
}

export function requireBadgeRule(input: {
	allRequiredTasksApproved: boolean;
	minimumScore?: number | null;
	minimumHours?: number | null;
}): BadgeRule {
	return {
		allRequiredTasksApproved: input.allRequiredTasksApproved,
		minimumScore: requireOptionalScore(input.minimumScore),
		minimumHours: requireOptionalHours(input.minimumHours),
	};
}

function requireOptionalScore(value: number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	if (!Number.isInteger(value) || value < 0 || value > 100) {
		throw errors.badRequest("Enter a pass mark from 1 to 100.", {
			reason: "invalid_threshold",
		});
	}
	return value;
}

function requireOptionalHours(value: number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	if (!Number.isInteger(value) || value < 0) {
		throw errors.badRequest("Enter a number of hours that is zero or more.", {
			reason: "invalid_hours",
		});
	}
	return value;
}

/** The rule pinned on a course version. Awarding the badge happens later. */
export function badgeRuleMet(
	rule: BadgeRule,
	progress: BadgeProgress,
): boolean {
	if (rule.allRequiredTasksApproved) {
		const approved = new Set(progress.approvedTaskIds);
		const covered = progress.requiredTaskIds.every((id) => approved.has(id));
		if (!covered) return false;
	}
	if (rule.minimumScore !== null) {
		if (progress.score === null || progress.score < rule.minimumScore) {
			return false;
		}
	}
	if (rule.minimumHours !== null) {
		if (progress.hours === null || progress.hours < rule.minimumHours) {
			return false;
		}
	}
	return true;
}
