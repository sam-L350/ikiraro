import { requireAuth } from "../../../../../../core/auth/require-auth";
import { clientIp } from "../../../../../../core/http/client-ip";
import {
	type AnswerStatus,
	decideAnswer,
} from "../../../../../../core/learning/peer";
import { db } from "../../../../../../db";

/** Show or hide an answer. The person who wrote it cannot decide. */
export async function createTaskAnswerDecision(input: {
	id: string;
	answerId: string;
	shown: boolean;
}): Promise<{ status: AnswerStatus }> {
	const user = await requireAuth();
	return decideAnswer(db, {
		userId: user.id,
		taskId: input.id,
		answerId: input.answerId,
		shown: input.shown,
		ip: clientIp(),
	});
}
