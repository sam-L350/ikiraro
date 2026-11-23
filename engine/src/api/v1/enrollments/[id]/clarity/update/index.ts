import { requireAuth } from "../../../../../../core/auth/require-auth";
import { authorize } from "../../../../../../core/authz/authorize";
import { clientIp } from "../../../../../../core/http/client-ip";
import {
	type ClarityRating,
	saveTaskClarity,
	type TaskClarity,
} from "../../../../../../core/learning/clarity";
import { readEnrollmentProgress } from "../../../../../../core/learning/progress";
import { db } from "../../../../../../db";

/** Record whether this pinned task is clear or too hard. */
export async function updateEnrollmentTaskClarity(input: {
	id: string;
	taskId: string;
	rating: ClarityRating;
}): Promise<TaskClarity> {
	const user = await requireAuth();
	const progress = await readEnrollmentProgress(db, input.id);
	await authorize({
		permission: "learning.progress",
		resource: {
			ownerId: String(progress.userId),
			centerId: progress.centerId,
		},
	});
	return saveTaskClarity(db, {
		enrollmentId: input.id,
		taskId: input.taskId,
		rating: input.rating,
		actorId: user.id,
		ip: clientIp(),
	});
}
