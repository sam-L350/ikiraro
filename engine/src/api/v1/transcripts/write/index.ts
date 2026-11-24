import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { reviewCenters } from "../../../../core/learning/review-queue";
import { writeTranscript } from "../../../../core/learning/transcripts";
import { db } from "../../../../db";

/** Store the trainer's transcript of a voice note. */
export async function createVoiceTranscript(input: {
	submissionId: string;
	body: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	const centers = await reviewCenters(db, user.id);
	const first = centers[0];
	if (!first) {
		await authorize({
			permission: "submission.review",
			resource: { ownerId: String(user.id) },
		});
		throw errors.forbidden("You do not review evidence for a center.");
	}
	await authorize({
		permission: "submission.review",
		resource: { centerId: first.id, districtId: first.districtId },
	});
	return writeTranscript(db, {
		reviewerId: user.id,
		submissionId: input.submissionId,
		body: input.body,
		ip: clientIp(),
	});
}
