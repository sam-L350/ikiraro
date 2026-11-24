import { requireAuth } from "../../../../../core/auth/require-auth";
import {
	type QuestionView,
	readQuestions,
} from "../../../../../core/learning/peer";
import { db } from "../../../../../db";

/** Questions on this task, and the answers a trainer has shown. */
export async function getTaskQuestions(input: { id: string }): Promise<{
	questions: QuestionView[];
	canAsk: boolean;
	canAnswer: boolean;
	canReview: boolean;
}> {
	const user = await requireAuth();
	return readQuestions(db, user.id, input.id);
}
