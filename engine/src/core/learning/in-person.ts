import { eq } from "drizzle-orm";
import type { Database } from "../../db";
import { contentVersions } from "../../db/schema";
import { errors } from "../api/error";

export type InPersonInput = {
	location: string;
	observedAt: string;
};

export type InPersonVisit = {
	location: string;
	observedAt: Date;
};

const LOCATION_LIMIT = 160;
const FUTURE_MS = 2 * 60 * 1000;

/** An old published course without the flag does not ask for a visit. */
export function inPersonRequired(snapshot: unknown): boolean {
	if (
		typeof snapshot !== "object" ||
		snapshot === null ||
		Array.isArray(snapshot)
	) {
		return false;
	}
	const badge = (snapshot as { badge?: unknown }).badge;
	if (typeof badge !== "object" || badge === null || Array.isArray(badge)) {
		return false;
	}
	return (badge as { requiresInPerson?: unknown }).requiresInPerson === true;
}

export function cleanInPerson(input: InPersonInput, now: Date): InPersonVisit {
	const location = input.location.trim();
	if (location.length < 1 || location.length > LOCATION_LIMIT) {
		throw errors.badRequest("Say where you saw the learner do this.", {
			reason: "location",
		});
	}
	const observedAt = new Date(input.observedAt);
	if (Number.isNaN(observedAt.getTime())) {
		throw errors.badRequest("Say when you saw the learner do this.", {
			reason: "observed",
		});
	}
	if (observedAt.getTime() > now.getTime() + FUTURE_MS) {
		throw errors.badRequest("That time is still in the future.", {
			reason: "observed",
		});
	}
	return { location, observedAt };
}

/** The visit the approval must store, or null when this badge does not ask. */
export async function requiredVisit(
	database: Pick<Database, "select">,
	input: {
		contentVersionId: string;
		decision: string;
		inPerson?: InPersonInput;
		now?: Date;
	},
): Promise<InPersonVisit | null> {
	if (input.decision !== "approved") {
		if (input.inPerson) {
			throw errors.badRequest(
				"Where you saw the work is recorded only when you approve it.",
				{ reason: "in_person" },
			);
		}
		return null;
	}
	const [version] = await database
		.select({ snapshot: contentVersions.snapshot })
		.from(contentVersions)
		.where(eq(contentVersions.id, input.contentVersionId))
		.limit(1);
	const required = inPersonRequired(version?.snapshot);
	if (!required) {
		if (input.inPerson) {
			throw errors.badRequest(
				"This badge does not ask where you saw the work.",
				{
					reason: "in_person",
				},
			);
		}
		return null;
	}
	if (!input.inPerson) {
		throw errors.badRequest(
			"This badge needs where and when you saw the work.",
			{ reason: "in_person" },
		);
	}
	return cleanInPerson(input.inPerson, input.now ?? new Date());
}
