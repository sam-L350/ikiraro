import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import {
	type FeedbackSnippet,
	updateFeedbackSnippet,
} from "../../../../../core/learning/feedback-library";
import { reviewCenters } from "../../../../../core/learning/review-queue";
import { db } from "../../../../../db";

async function allowEditor(userId: number): Promise<void> {
	const centers = await reviewCenters(db, userId);
	const first = centers[0];
	if (first) {
		await authorize({
			permission: "submission.review",
			resource: { centerId: first.id, districtId: first.districtId },
		});
		return;
	}
	await authorize({ permission: "admin.manage" });
}

/** Change a saved line. The trainer can still edit it again after inserting it. */
export async function updateFeedbackSnippetRecord(input: {
	id: string;
	locale: string;
	body: string;
}): Promise<FeedbackSnippet> {
	const user = await requireAuth();
	await allowEditor(user.id);
	return updateFeedbackSnippet(db, {
		actorId: user.id,
		id: input.id,
		locale: input.locale,
		body: input.body,
		ip: clientIp(),
	});
}
