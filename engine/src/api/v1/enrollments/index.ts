import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import type { EnrollmentProgress } from "../../../core/learning/progress";
import { listEnrollmentProgress } from "../../../core/learning/progress";
import { db } from "../../../db";

/** Progress for the courses this person has started. */
export async function getEnrollments(): Promise<{
	enrollments: EnrollmentProgress[];
}> {
	const user = await requireAuth();
	await authorize({
		permission: "learning.progress",
		resource: { ownerId: String(user.id) },
	});
	return { enrollments: await listEnrollmentProgress(db, user.id) };
}
