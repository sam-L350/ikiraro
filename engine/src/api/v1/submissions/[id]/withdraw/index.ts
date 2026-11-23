import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import {
	type SubmissionView,
	withdrawSubmission,
} from "../../../../../core/learning/submissions";
import { db } from "../../../../../db";

/** Take an attempt back before a trainer starts the review. */
export async function createSubmissionWithdraw(input: {
	id: string;
}): Promise<SubmissionView> {
	const user = await requireAuth();
	await authorize({ permission: "learning.progress" });
	return withdrawSubmission(db, {
		id: input.id,
		ownerUserId: user.id,
		ip: clientIp(),
	});
}
