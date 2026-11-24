import { requireAuth } from "../../../core/auth/require-auth";
import {
	type AwardCondition,
	listOwnConditions,
} from "../../../core/hardware/recovery";
import { db } from "../../../db";

/** Conditions stored on the signed-in recipient's grants. */
export async function getConditions(): Promise<{ grants: AwardCondition[] }> {
	const user = await requireAuth();
	return { grants: await listOwnConditions(db, user.id) };
}
