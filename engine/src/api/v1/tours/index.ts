import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import { readTours, type TourList } from "../../../core/coverage/tours";
import { db } from "../../../db";

/** Tours a manager or coordinator can run. */
export async function getTours(): Promise<TourList> {
	const user = await requireAuth();
	return readTours(db, await loadAssignments(user.id));
}
