import { requireAuth } from "../../../core/auth/require-auth";
import {
	type FollowUpRow,
	listOwnFollowUps,
} from "../../../core/hardware/follow-ups";
import { db } from "../../../db";

/** The signed-in recipient's 30, 90, and 180 day check-ins. */
export async function getFollowUps(): Promise<{ items: FollowUpRow[] }> {
	const user = await requireAuth();
	return { items: await listOwnFollowUps(db, user.id) };
}
