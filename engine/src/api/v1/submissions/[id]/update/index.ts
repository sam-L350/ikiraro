import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import {
	type SubmissionView,
	saveDraftSubmission,
} from "../../../../../core/learning/submissions";
import { db } from "../../../../../db";

/**
 * Keep or send a draft the learner still owns. A decided attempt is refused
 * so the server's review stands.
 */
export async function updateTaskSubmission(input: {
	id: string;
	note?: string;
	submit: boolean;
}): Promise<SubmissionView> {
	const user = await requireAuth();
	await authorize({ permission: "learning.progress" });
	return saveDraftSubmission(db, {
		id: input.id,
		ownerUserId: user.id,
		note: input.note,
		submit: input.submit,
		ip: clientIp(),
	});
}
