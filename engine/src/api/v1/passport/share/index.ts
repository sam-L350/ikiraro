import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	readShareSettings,
	type ShareSettings,
} from "../../../../core/learning/share";
import { db } from "../../../../db";

/** The signed-in learner's share link and which items a stranger may see. */
export async function getPassportShare(): Promise<ShareSettings> {
	const user = await requireAuth();
	await authorize({
		permission: "learning.progress",
		resource: { ownerId: String(user.id) },
	});
	return readShareSettings(db, user.id);
}
