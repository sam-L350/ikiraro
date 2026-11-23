import { and, eq, ne } from "drizzle-orm";
import type { Database } from "../../db";
import { taskSubmissions } from "../../db/schema";

export const DUPLICATE_KINDS = ["none", "same", "other"] as const;

export type DuplicateKind = (typeof DUPLICATE_KINDS)[number];

export function isDuplicateKind(value: string): value is DuplicateKind {
	switch (value) {
		case "none":
		case "same":
		case "other":
			return true;
		default:
			return false;
	}
}

/** Another learner's copy wins over the same learner sending the file again. */
export function duplicateKind(
	ownerUserId: number,
	matches: readonly { ownerUserId: number }[],
): DuplicateKind {
	let kind: DuplicateKind = "none";
	for (const match of matches) {
		if (match.ownerUserId !== ownerUserId) return "other";
		kind = "same";
	}
	return kind;
}

/** A waiting copy is raised when a later file matches it. It is never lowered. */
export function raisedKind(
	current: DuplicateKind,
	existingOwner: number,
	incomingOwner: number,
): DuplicateKind {
	if (existingOwner !== incomingOwner) return "other";
	if (current === "none") return "same";
	return current;
}

type FlagDb = Pick<Database, "select" | "update">;

/**
 * Flag this attempt, and any copy still waiting, when the hash is already stored.
 * A draft is not a copy. A note has no hash.
 */
export async function applyDuplicateFlag(
	database: FlagDb,
	input: {
		submissionId: string;
		ownerUserId: number;
		contentHash: string | null;
	},
): Promise<DuplicateKind> {
	if (!input.contentHash) return "none";
	const matches = await database
		.select({
			id: taskSubmissions.id,
			ownerUserId: taskSubmissions.ownerUserId,
			status: taskSubmissions.status,
			duplicateKind: taskSubmissions.duplicateKind,
		})
		.from(taskSubmissions)
		.where(
			and(
				eq(taskSubmissions.contentHash, input.contentHash),
				ne(taskSubmissions.id, input.submissionId),
				ne(taskSubmissions.status, "draft"),
			),
		);
	const kind = duplicateKind(input.ownerUserId, matches);
	if (kind !== "none") {
		await database
			.update(taskSubmissions)
			.set({ duplicateKind: kind })
			.where(eq(taskSubmissions.id, input.submissionId));
	}
	for (const match of matches) {
		if (match.status !== "pending" && match.status !== "in_review") continue;
		if (!isDuplicateKind(match.duplicateKind)) continue;
		const next = raisedKind(
			match.duplicateKind,
			match.ownerUserId,
			input.ownerUserId,
		);
		if (next === match.duplicateKind) continue;
		await database
			.update(taskSubmissions)
			.set({ duplicateKind: next })
			.where(eq(taskSubmissions.id, match.id));
	}
	return kind;
}
