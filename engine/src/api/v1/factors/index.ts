import { type FactorState, readFactor } from "../../../core/auth/factors";
import { requireAuth } from "../../../core/auth/require-auth";
import { db } from "../../../db";

/** Whether a second code is on. The secret is not returned. */
export async function getStaffFactor(): Promise<FactorState> {
	const user = await requireAuth();
	return readFactor(db, user.id);
}
