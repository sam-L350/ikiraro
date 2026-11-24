import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { decideMerge } from "../../../../core/identity/duplicates";
import { db } from "../../../../db";

/** A different admin approves or stops a waiting merge. */
export async function createAccountMergeDecision(input: {
	requestId: string;
	decision: string;
	note: string;
}): Promise<{ id: string; status: "approved" | "declined" }> {
	const user = await requireAuth();
	return decideMerge(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		requestId: input.requestId,
		decision: input.decision,
		note: input.note,
		ip: clientIp(),
	});
}
