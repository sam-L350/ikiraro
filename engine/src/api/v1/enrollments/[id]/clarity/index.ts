import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import {
	listEnrollmentClarity,
	type TaskClarity,
} from "../../../../../core/learning/clarity";
import { readEnrollmentProgress } from "../../../../../core/learning/progress";
import { db } from "../../../../../db";

/** The signed-in learner's clarity ratings on this enrollment. */
export async function getEnrollmentClarity(input: {
	id: string;
}): Promise<{ ratings: TaskClarity[] }> {
	await requireAuth();
	const progress = await readEnrollmentProgress(db, input.id);
	await authorize({
		permission: "learning.progress",
		resource: {
			ownerId: String(progress.userId),
			centerId: progress.centerId,
		},
	});
	return { ratings: await listEnrollmentClarity(db, input.id) };
}
