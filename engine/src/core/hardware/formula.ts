import { errors } from "../api/error";

const WEIGHTS = ["points", "badges", "hours", "attendance", "months"] as const;

export type FormulaWeight = (typeof WEIGHTS)[number];

export type FormulaWeights = {
	points: number;
	badges: number;
	hours: number;
	attendance: number;
	months: number;
};

export type GrantFormula = {
	weights: FormulaWeights;
	tieBreak: "none" | "earlier_application";
	onePerHousehold: boolean;
	blockActiveGrant: boolean;
	quota?: number;
	genderTarget?: { gender: string; count: number };
	youthTarget?: { maxAge: number; count: number };
};

export type RankMetrics = {
	points: number;
	badges: number;
	hours: number;
	attendance: number;
	months: number;
};

const FORMULA_KEYS = new Set([
	"weights",
	"tieBreak",
	"onePerHousehold",
	"blockActiveGrant",
	"quota",
	"genderTarget",
	"youthTarget",
]);

/** The score is the weights written on the round, applied to this learner. */
export function rankScore(
	metrics: RankMetrics,
	weights: FormulaWeights,
): number {
	return (
		weights.points * metrics.points +
		weights.badges * metrics.badges +
		weights.hours * metrics.hours +
		weights.attendance * metrics.attendance +
		weights.months * metrics.months
	);
}

export function assignRanks<T extends { score: number; at: number }>(
	rows: readonly T[],
	tieBreak: GrantFormula["tieBreak"],
): (T & { rank: number })[] {
	const sorted = [...rows].sort((left, right) => {
		if (right.score !== left.score) return right.score - left.score;
		if (tieBreak === "earlier_application") return left.at - right.at;
		return 0;
	});
	if (tieBreak === "earlier_application") {
		return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
	}
	if (tieBreak !== "none") {
		const unreachable: never = tieBreak;
		return unreachable;
	}
	let rank = 1;
	return sorted.map((row, index) => {
		const previous = sorted[index - 1];
		if (previous && row.score < previous.score) rank = index + 1;
		return { ...row, rank };
	});
}

/** An empty object means the round has no formula yet. A partial object is refused. */
export function parseFormula(value: unknown): GrantFormula | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== "object" || Array.isArray(value)) {
		throw errors.badRequest("Write the formula for this round.", {
			reason: "formula",
		});
	}
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record);
	if (keys.length === 0) return null;
	for (const key of keys) {
		if (!FORMULA_KEYS.has(key)) {
			throw errors.badRequest("Write the formula for this round.", {
				reason: "formula",
			});
		}
	}
	if (
		!("weights" in record) ||
		!("tieBreak" in record) ||
		!("onePerHousehold" in record) ||
		!("blockActiveGrant" in record)
	) {
		throw errors.badRequest("Write the formula for this round.", {
			reason: "formula",
		});
	}
	const tieBreak = record.tieBreak;
	if (tieBreak !== "none" && tieBreak !== "earlier_application") {
		throw errors.badRequest("Choose how a tie is broken.", {
			reason: "formula",
		});
	}
	if (
		typeof record.onePerHousehold !== "boolean" ||
		typeof record.blockActiveGrant !== "boolean"
	) {
		throw errors.badRequest("Write the formula for this round.", {
			reason: "formula",
		});
	}
	const formula: GrantFormula = {
		weights: weightsOf(record.weights),
		tieBreak,
		onePerHousehold: record.onePerHousehold,
		blockActiveGrant: record.blockActiveGrant,
	};
	if ("quota" in record) formula.quota = countOf(record.quota, "quota");
	if ("genderTarget" in record)
		formula.genderTarget = genderOf(record.genderTarget);
	if ("youthTarget" in record)
		formula.youthTarget = youthOf(record.youthTarget);
	return formula;
}

function weightsOf(value: unknown): FormulaWeights {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw errors.badRequest("Write a weight for each part of the formula.", {
			reason: "formula",
		});
	}
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record);
	if (
		keys.length !== WEIGHTS.length ||
		WEIGHTS.some((key) => !(key in record))
	) {
		throw errors.badRequest("Write a weight for each part of the formula.", {
			reason: "formula",
		});
	}
	return {
		points: weightOf(record.points),
		badges: weightOf(record.badges),
		hours: weightOf(record.hours),
		attendance: weightOf(record.attendance),
		months: weightOf(record.months),
	};
}

function weightOf(value: unknown): number {
	if (
		typeof value !== "number" ||
		!Number.isInteger(value) ||
		value < 0 ||
		value > 1000
	) {
		throw errors.badRequest("Write a weight for each part of the formula.", {
			reason: "formula",
		});
	}
	return value;
}

function countOf(value: unknown, reason: string): number {
	if (
		typeof value !== "number" ||
		!Number.isInteger(value) ||
		value < 1 ||
		value > 1000
	) {
		throw errors.badRequest("That number is not usable.", { reason });
	}
	return value;
}

function genderOf(value: unknown): { gender: string; count: number } {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw errors.badRequest("Write the gender target in full.", {
			reason: "formula",
		});
	}
	const record = value as Record<string, unknown>;
	if (typeof record.gender !== "string") {
		throw errors.badRequest("Write the gender target in full.", {
			reason: "formula",
		});
	}
	const gender = record.gender.trim();
	if (gender.length < 1 || gender.length > 40) {
		throw errors.badRequest("Write the gender target in full.", {
			reason: "formula",
		});
	}
	return { gender, count: countOf(record.count, "formula") };
}

function youthOf(value: unknown): { maxAge: number; count: number } {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw errors.badRequest("Write the youth target in full.", {
			reason: "formula",
		});
	}
	const record = value as Record<string, unknown>;
	const maxAge = record.maxAge;
	if (
		typeof maxAge !== "number" ||
		!Number.isInteger(maxAge) ||
		maxAge < 1 ||
		maxAge > 120
	) {
		throw errors.badRequest("Write the youth target in full.", {
			reason: "formula",
		});
	}
	return { maxAge, count: countOf(record.count, "formula") };
}

export function ageYears(dob: string | null, now: Date): number | null {
	if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
	const born = new Date(`${dob}T00:00:00.000Z`);
	if (Number.isNaN(born.getTime())) return null;
	let age = now.getUTCFullYear() - born.getUTCFullYear();
	const month = now.getUTCMonth() - born.getUTCMonth();
	if (month < 0 || (month === 0 && now.getUTCDate() < born.getUTCDate()))
		age -= 1;
	return age >= 0 ? age : null;
}

export function sameGuardian(
	left: string | null,
	right: string | null,
): boolean {
	const a = left?.trim().toLowerCase() ?? "";
	const b = right?.trim().toLowerCase() ?? "";
	return a !== "" && a === b;
}
