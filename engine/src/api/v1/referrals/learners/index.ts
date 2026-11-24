import { requireAuth } from "../../../../core/auth/require-auth";
import { listReferralLearners } from "../../../../core/hardware/opportunities";
import { db } from "../../../../db";

/** Learners a trainer or coordinator can recommend. */
export async function getReferralLearners() {
	const user = await requireAuth();
	return { items: await listReferralLearners(db, user.id) };
}
