import { requireAuth } from "../../../../../../core/auth/require-auth";
import { clientIp } from "../../../../../../core/http/client-ip";
import { answerQuestion } from "../../../../../../core/learning/peer";
import { db } from "../../../../../../db";

/** Answer a question. It stays hidden until a different trainer shows it. */
export async function createTaskAnswer(input: {
	id: string;
	questionId: string;
	body: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return answerQuestion(db, {
		userId: user.id,
		taskId: input.id,
		questionId: input.questionId,
		body: input.body,
		ip: clientIp(),
	});
}
