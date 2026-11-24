import { requireAuth } from "../../../core/auth/require-auth";
import { readOwnMentorship } from "../../../core/hardware/mentors";
import { db } from "../../../db";

/** This person's application, opt-ins, and requests. */
export async function getMentors() {
	const user = await requireAuth();
	return readOwnMentorship(db, user.id);
}
