import { requireAuth } from "../../../core/auth/require-auth";
import { listMessageMatches } from "../../../core/hardware/messages";
import { db } from "../../../db";

/** Accepted matches this person can message. */
export async function getMessages() {
	const user = await requireAuth();
	return { items: await listMessageMatches(db, user.id) };
}
