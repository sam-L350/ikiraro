import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	listLearnerSchedule,
	type ScheduleItem,
} from "../../../core/learning/center-sessions";
import { db } from "../../../db";

/** Upcoming sessions at the learner's home center. */
export async function getSchedule(): Promise<{ items: ScheduleItem[] }> {
	const user = await requireAuth();
	await authorize({
		permission: "learning.progress",
		resource: { ownerId: String(user.id) },
	});
	return listLearnerSchedule(db, { learnerId: user.id });
}
