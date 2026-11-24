import { requireAuth } from "../../../core/auth/require-auth";
import { type OpenPulse, readPulse } from "../../../core/support/pulse";
import { db } from "../../../db";

/** The moment this person can still answer, if there is one. */
export async function getSatisfactionPulse(): Promise<OpenPulse> {
	const user = await requireAuth();
	return readPulse(db, user.id);
}
