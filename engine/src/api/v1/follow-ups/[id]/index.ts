import { requireAuth } from "../../../../core/auth/require-auth";
import {
	type FollowUpRow,
	readOwnFollowUp,
} from "../../../../core/hardware/follow-ups";
import { db } from "../../../../db";

/** One of the signed-in recipient's check-ins. */
export async function getFollowUp(input: { id: string }): Promise<FollowUpRow> {
	const user = await requireAuth();
	return readOwnFollowUp(db, { userId: user.id, followUpId: input.id });
}
