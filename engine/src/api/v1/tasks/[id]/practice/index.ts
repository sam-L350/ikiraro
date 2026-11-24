import { requireAuth } from "../../../../../core/auth/require-auth";
import {
	type PracticeSample,
	readPractice,
} from "../../../../../core/learning/peer";
import { db } from "../../../../../db";

/** The sample for rehearsing this task. It is not evidence. */
export async function getTaskPractice(input: { id: string }): Promise<{
	sample: PracticeSample | null;
	canWrite: boolean;
}> {
	const user = await requireAuth();
	return readPractice(db, user.id, input.id);
}
