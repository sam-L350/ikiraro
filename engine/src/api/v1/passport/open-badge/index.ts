import { requireAuth } from "../../../../core/auth/require-auth";
import { exportOpenBadge } from "../../../../core/portable/portable";
import { db } from "../../../../db";

/** An Open Badges file for one badge on this person's passport. */
export async function getPassportOpenBadge(input: {
	id: string;
}): Promise<{ json: string }> {
	const user = await requireAuth();
	return exportOpenBadge(db, { userId: user.id, badgeId: input.id });
}
