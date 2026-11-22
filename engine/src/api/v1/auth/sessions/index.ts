import { getRequestContext } from "../../../../core/api/context";
import { requireAuth } from "../../../../core/auth/require-auth";
import {
	getSessionTokenFromRequest,
	listSessions,
} from "../../../../core/auth/sessions";
import { authorize } from "../../../../core/authz/authorize";
import { db } from "../../../../db";

/**
 * Open sessions for the signed-in person. The id is the stored hash, so it
 * cannot be replayed as a cookie.
 */
export async function getAuthSessions(): Promise<{
	sessions: {
		id: string;
		createdAt: Date;
		sharedDevice: boolean;
		current: boolean;
	}[];
}> {
	const user = await requireAuth();
	await authorize({
		permission: "profile.read.self",
		resource: { ownerId: String(user.id) },
	});
	const token = getSessionTokenFromRequest(getRequestContext().request) ?? "";
	return {
		sessions: await listSessions(db, { userId: user.id, token }),
	};
}
