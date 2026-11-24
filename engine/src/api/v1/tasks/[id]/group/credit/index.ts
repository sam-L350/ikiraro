import { requireAuth } from "../../../../../../core/auth/require-auth";
import { clientIp } from "../../../../../../core/http/client-ip";
import { recordCredit } from "../../../../../../core/learning/peer";
import { db } from "../../../../../../db";

/** Record what this person did. It does not award points. */
export async function createTaskGroupCredit(input: {
	id: string;
	groupId: string;
	body: string;
}): Promise<{ body: string }> {
	const user = await requireAuth();
	return recordCredit(db, {
		userId: user.id,
		taskId: input.id,
		groupId: input.groupId,
		body: input.body,
		ip: clientIp(),
	});
}
