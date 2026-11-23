import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	type FeedbackSnippet,
	listFeedbackSnippets,
} from "../../../core/learning/feedback-library";
import { reviewCenters } from "../../../core/learning/review-queue";
import { db } from "../../../db";

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

/** Saved feedback lines in Kinyarwanda and English. */
export async function getFeedbackSnippets(): Promise<{
	items: FeedbackSnippet[];
}> {
	const user = await requireAuth();
	await allowEditor(user.id);
	return listFeedbackSnippets(db);
}
