import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	readSessionJoin,
	type SessionJoin,
} from "../../../../core/learning/center-sessions";
import { db } from "../../../../db";

/** The session a learner is about to check in to. The code is not sent back. */
export async function getCenterSessionJoin(input: {
	token: string;
}): Promise<SessionJoin> {
	const user = await requireAuth();
	await authorize({
		permission: "learning.progress",
		resource: { ownerId: String(user.id) },
	});
	return readSessionJoin(db, { learnerId: user.id, token: input.token });
}
