import { errors } from "../../../core/api/error";
import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import {
	type LearnerRound,
	listLearnerRounds,
} from "../../../core/hardware/rounds";
import { db } from "../../../db";

/** Open rounds in the learner's district, with the check for each rule. */
export async function getAllocation(): Promise<{ rounds: LearnerRound[] }> {
	const user = await requireAuth();
	const assignments = await loadAssignments(user.id);
	if (!assignments.some((assignment) => assignment.role === "learner")) {
		throw errors.forbidden("Rounds are for learners in that district.");
	}
	return { rounds: await listLearnerRounds(db, user.id) };
}
