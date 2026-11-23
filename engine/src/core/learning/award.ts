import { sql } from "drizzle-orm";
import type { Database } from "../../db";
import { errors } from "../api/error";
import type { ScoreInput } from "./verifications";

export type AwardResult = {
	id: string;
	submissionId: string;
	decision: "approved";
	scoreTotal: number | null;
	points: number;
	verifiedMinutes: number;
	badgeId: string | null;
};

function textOf(error: unknown): string {
	if (error instanceof Error) return `${error.message} ${textOf(error.cause)}`;
	return "";
}

function fail(error: unknown): never {
	const text = textOf(error);
	if (text.includes("ikiraro:self")) {
		throw errors.forbidden("You cannot review your own work.", {
			reason: "self",
		});
	}
	if (text.includes("ikiraro:relative")) {
		throw errors.forbidden("You cannot review a relative.", {
			reason: "relative",
		});
	}
	if (text.includes("ikiraro:scope") || text.includes("ikiraro:missing")) {
		throw errors.notFound("That submission was not found.");
	}
	if (text.includes("ikiraro:closed")) {
		throw errors.conflict("This attempt is no longer waiting.", {
			reason: "closed",
		});
	}
	if (text.includes("ikiraro:score")) {
		throw errors.badRequest("Score each part of the rubric once.", {
			reason: "score",
		});
	}
	if (text.includes("ikiraro:threshold")) {
		throw errors.badRequest("The score is below the pass mark.", {
			reason: "threshold",
		});
	}
	if (text.includes("ikiraro:note")) {
		throw errors.badRequest("Write the note that goes with this decision.", {
			reason: "note",
		});
	}
	if (text.includes("ikiraro:key")) {
		throw errors.badRequest("This approval needs an idempotency key.", {
			reason: "key",
		});
	}
	if (text.includes("ikiraro:passport")) {
		throw errors.internal("The learner has no passport to add hours to.");
	}
	if (error instanceof Error) throw error;
	throw errors.internal("The award could not be recorded.");
}

function isAward(value: unknown): value is AwardResult {
	if (typeof value !== "object" || value === null) return false;
	const row = value as Record<string, unknown>;
	return (
		typeof row.id === "string" &&
		typeof row.submissionId === "string" &&
		row.decision === "approved" &&
		(typeof row.scoreTotal === "number" || row.scoreTotal === null) &&
		typeof row.points === "number" &&
		typeof row.verifiedMinutes === "number" &&
		(typeof row.badgeId === "string" || row.badgeId === null)
	);
}

function readResult(rows: unknown): unknown {
	if (!Array.isArray(rows) || rows.length === 0) return null;
	const first = rows[0] as { result?: unknown };
	const value = first.result;
	if (typeof value === "string") return JSON.parse(value) as unknown;
	return value;
}

/** One database call. A failure inside the function leaves no award rows. */
export async function awardSubmission(
	database: Pick<Database, "execute">,
	input: {
		submissionId: string;
		reviewerId: number;
		note: string;
		scores: readonly ScoreInput[];
		idempotencyKey: string;
		ip: string;
	},
): Promise<AwardResult> {
	try {
		const rows = await database.execute(sql`
			select award_submission(
				${input.submissionId}::uuid,
				${input.reviewerId},
				${input.note},
				${JSON.stringify(input.scores)}::jsonb,
				${input.idempotencyKey},
				${input.ip}
			) as result
		`);
		const result = readResult(rows);
		if (!isAward(result)) {
			throw errors.internal("The award could not be read.");
		}
		return result;
	} catch (error) {
		fail(error);
	}
}
