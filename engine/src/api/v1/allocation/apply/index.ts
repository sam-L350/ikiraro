import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { applyToRound } from "../../../../core/hardware/rounds";
import { clientIp } from "../../../../core/http/client-ip";
import type { EligibilityOutcome } from "../../../../core/learning/eligibility";
import { db } from "../../../../db";

/** Apply when every rule passes. The result of each rule is stored on the row. */
export async function createAllocationApplication(input: {
	roundId: string;
	statement: string;
}): Promise<{ id: string; results: EligibilityOutcome[] }> {
	const user = await requireAuth();
	const assignments = await loadAssignments(user.id);
	if (!assignments.some((assignment) => assignment.role === "learner")) {
		throw errors.forbidden("Rounds are for learners in that district.");
	}
	return applyToRound(db, {
		actorId: user.id,
		roundId: input.roundId,
		statement: input.statement,
		ip: clientIp(),
	});
}
