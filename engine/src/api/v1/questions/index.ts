import { requireAuth } from "../../../core/auth/require-auth";
import {
	type QuestionQueueRow,
	readQuestionQueue,
} from "../../../core/learning/peer";
import { db } from "../../../db";

/** Questions and answers waiting for a trainer at this person's centers. */
export async function getQuestionQueue(): Promise<{
	waiting: QuestionQueueRow[];
}> {
	const user = await requireAuth();
	return readQuestionQueue(db, user.id);
}
