import { requireAuth } from "../../../core/auth/require-auth";
import { listDiscoverable } from "../../../core/hardware/mentors";
import { db } from "../../../db";

/** Learners who opted in, for an approved mentor. */
export async function getMentorDiscover() {
	const user = await requireAuth();
	return listDiscoverable(db, user.id);
}
