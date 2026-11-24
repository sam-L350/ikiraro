import { requireAuth } from "../../../../../../core/auth/require-auth";
import { clientIp } from "../../../../../../core/http/client-ip";
import { askQuestion } from "../../../../../../core/learning/peer";
import { db } from "../../../../../../db";

/** Ask a question on this task. */
export async function createTaskQuestion(input: {
	id: string;
	body: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return askQuestion(db, {
		userId: user.id,
		taskId: input.id,
		body: input.body,
		ip: clientIp(),
	});
}
