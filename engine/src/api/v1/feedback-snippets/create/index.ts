import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	createFeedbackSnippet,
	type FeedbackSnippet,
} from "../../../../core/learning/feedback-library";
import { reviewCenters } from "../../../../core/learning/review-queue";
import { db } from "../../../../db";

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

/** Add a line a trainer can insert into feedback. */
export async function createFeedbackSnippetRecord(input: {
	locale: string;
	body: string;
}): Promise<FeedbackSnippet> {
	const user = await requireAuth();
	await allowEditor(user.id);
	return createFeedbackSnippet(db, {
		actorId: user.id,
		locale: input.locale,
		body: input.body,
		ip: clientIp(),
	});
}
