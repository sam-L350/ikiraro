import { requireAuth } from "../../../core/auth/require-auth";
import { listOpportunities } from "../../../core/hardware/opportunities";
import { db } from "../../../db";

/** Opportunities whose skill matches a badge this learner holds. */
export async function getOpportunities() {
	const user = await requireAuth();
	return listOpportunities(db, user.id);
}
