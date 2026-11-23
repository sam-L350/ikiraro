import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	type LearnerPassport,
	readPassport,
} from "../../../core/learning/passport";
import { db } from "../../../db";

/** Hours, points, badges, and finished tasks for the signed-in learner. */
export async function getPassport(): Promise<LearnerPassport> {
	const user = await requireAuth();
	await authorize({
		permission: "learning.progress",
		resource: { ownerId: String(user.id) },
	});
	return readPassport(db, user.id);
}
