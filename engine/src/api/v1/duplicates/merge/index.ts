import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { proposeMerge } from "../../../../core/identity/duplicates";
import { db } from "../../../../db";

/** Ask a second admin to merge two accounts. */
export async function createAccountMerge(input: {
	keepUserId: number;
	dropUserId: number;
	reason: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return proposeMerge(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		keepUserId: input.keepUserId,
		dropUserId: input.dropUserId,
		reason: input.reason,
		ip: clientIp(),
	});
}
