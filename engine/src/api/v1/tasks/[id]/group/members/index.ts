import { requireAuth } from "../../../../../../core/auth/require-auth";
import { clientIp } from "../../../../../../core/http/client-ip";
import { addGroupMember } from "../../../../../../core/learning/peer";
import { db } from "../../../../../../db";

/** Add someone enrolled in this course at the same center. */
export async function createTaskGroupMember(input: {
	id: string;
	groupId: string;
	userId: number;
}): Promise<{ userId: number }> {
	const user = await requireAuth();
	return addGroupMember(db, {
		actorId: user.id,
		taskId: input.id,
		groupId: input.groupId,
		userId: input.userId,
		ip: clientIp(),
	});
}
