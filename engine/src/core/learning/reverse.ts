import { sql } from "drizzle-orm";
import type { Database } from "../../db";
import { errors } from "../api/error";

export type ReversalResult = {
	id: string;
	verificationId: string;
	points: number;
	verifiedMinutes: number;
	badgeRevoked: boolean;
	reviewerSuspended: boolean;
};

function textOf(error: unknown): string {
	if (error instanceof Error) return `${error.message} ${textOf(error.cause)}`;
	return "";
}

function fail(error: unknown): never {
	const text = textOf(error);
	if (text.includes("ikiraro:scope")) {
		throw errors.forbidden("You cannot reverse this approval.", {
			reason: "scope",
		});
	}
	if (text.includes("ikiraro:missing")) {
		throw errors.notFound("That approval was not found.");
	}
	if (text.includes("ikiraro:decision") || text.includes("ikiraro:closed")) {
		throw errors.conflict("That approval cannot be reversed.", {
			reason: "closed",
		});
	}
	if (text.includes("ikiraro:reason")) {
		throw errors.badRequest("Write the reason for reversing this.", {
			reason: "reason",
		});
	}
	if (text.includes("ikiraro:key")) {
		throw errors.badRequest("This reversal needs an idempotency key.", {
			reason: "key",
		});
	}
	if (text.includes("ikiraro:passport")) {
		throw errors.internal("The learner has no passport to take hours from.");
	}
	if (error instanceof Error) throw error;
	throw errors.internal("The reversal could not be recorded.");
}

function isReversal(value: unknown): value is ReversalResult {
	if (typeof value !== "object" || value === null) return false;
	const row = value as Record<string, unknown>;
	return (
		typeof row.id === "string" &&
		typeof row.verificationId === "string" &&
		typeof row.points === "number" &&
		typeof row.verifiedMinutes === "number" &&
		typeof row.badgeRevoked === "boolean" &&
		typeof row.reviewerSuspended === "boolean"
	);
}

function readResult(rows: unknown): unknown {
	if (!Array.isArray(rows) || rows.length === 0) return null;
	const first = rows[0] as { result?: unknown };
	const value = first.result;
	if (typeof value === "string") return JSON.parse(value) as unknown;
	return value;
}

/** One database call. A failure leaves the original award untouched. */
export async function reverseAward(
	database: Pick<Database, "execute">,
	input: {
		verificationId: string;
		actorId: number;
		reason: string;
		idempotencyKey: string;
		suspendReviewer: boolean;
		ip: string;
	},
): Promise<ReversalResult> {
	try {
		const rows = await database.execute(sql`
			select reverse_award(
				${input.verificationId}::uuid,
				${input.actorId},
				${input.reason},
				${input.idempotencyKey},
				${input.suspendReviewer},
				${input.ip}
			) as result
		`);
		const result = readResult(rows);
		if (!isReversal(result)) {
			throw errors.internal("The reversal could not be read.");
		}
		return result;
	} catch (error) {
		fail(error);
	}
}
