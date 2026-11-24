import { requireAuth } from "../../../core/auth/require-auth";
import { listOwnReferrals } from "../../../core/hardware/opportunities";
import { db } from "../../../db";

/** Recommendations written about the signed-in learner. */
export async function getReferrals() {
	const user = await requireAuth();
	return { items: await listOwnReferrals(db, user.id) };
}
