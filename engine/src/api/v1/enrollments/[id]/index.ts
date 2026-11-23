import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import type { EnrollmentProgress } from "../../../../core/learning/progress";
import { readEnrollmentProgress } from "../../../../core/learning/progress";
import { db } from "../../../../db";

/** Course, module, and task progress, plus the one task to do next. */
export async function getEnrollment(input: {
	id: string;
}): Promise<EnrollmentProgress> {
	await requireAuth();
	const progress = await readEnrollmentProgress(db, input.id);
	await authorize({
		permission: "learning.progress",
		resource: {
			ownerId: String(progress.userId),
			centerId: progress.centerId,
		},
	});
	return progress;
}
