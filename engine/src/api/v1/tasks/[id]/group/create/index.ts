import { requireAuth } from "../../../../../../core/auth/require-auth";
import { clientIp } from "../../../../../../core/http/client-ip";
import { createGroup } from "../../../../../../core/learning/peer";
import { db } from "../../../../../../db";

/** Start a cooperative or a family for this task. */
export async function createTaskGroup(input: {
	id: string;
	kind: string;
	name: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return createGroup(db, {
		userId: user.id,
		taskId: input.id,
		kind: input.kind,
		name: input.name,
		ip: clientIp(),
	});
}
