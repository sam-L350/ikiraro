import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import type { EnrollmentProgress } from "../../../../../core/learning/progress";
import {
	readEnrollmentProgress,
	startTaskProgress,
} from "../../../../../core/learning/progress";
import { db } from "../../../../../db";

/** Mark the pinned task as started. Completion waits for an approved submission. */
export async function createEnrollmentTaskStart(input: {
	id: string;
	taskId: string;
}): Promise<EnrollmentProgress> {
	const user = await requireAuth();
	const progress = await readEnrollmentProgress(db, input.id);
	await authorize({
		permission: "learning.progress",
		resource: {
			ownerId: String(progress.userId),
			centerId: progress.centerId,
		},
	});
	return startTaskProgress(db, {
		enrollmentId: input.id,
		taskId: input.taskId,
		actorId: user.id,
		ip: clientIp(),
	});
}
