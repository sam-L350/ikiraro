import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import {
	listSubmissions,
	type SubmissionView,
} from "../../../../../core/learning/submissions";
import { db } from "../../../../../db";

/** The learner's attempts on this enrollment, newest first. */
export async function getEnrollmentSubmissions(input: {
	id: string;
}): Promise<{ submissions: SubmissionView[] }> {
	const user = await requireAuth();
	await authorize({ permission: "learning.progress" });
	const submissions = await listSubmissions(db, {
		enrollmentId: input.id,
		ownerUserId: user.id,
	});
	return { submissions };
}
