import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { type OpenTour, readOpenTours } from "../../../../core/coverage/tours";
import { db } from "../../../../db";

/** Upcoming pop-up sessions a learner can join. */
export async function getTourOpenSessions(): Promise<{ sessions: OpenTour[] }> {
	const user = await requireAuth();
	return readOpenTours(db, {
		userId: user.id,
		assignments: await loadAssignments(user.id),
	});
}
