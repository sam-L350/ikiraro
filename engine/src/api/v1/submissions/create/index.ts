import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	createSubmission,
	type SubmissionView,
} from "../../../../core/learning/submissions";
import { db } from "../../../../db";

/** Store one attempt at a pinned task. The same client id is the same attempt. */
export async function createTaskSubmission(input: {
	id: string;
	enrollmentId: string;
	taskId: string;
	mediaId?: string;
	note?: string;
	deviceInfo?: string;
	geoLat?: number;
	geoLng?: number;
	submit: boolean;
}): Promise<SubmissionView> {
	const user = await requireAuth();
	await authorize({ permission: "learning.progress" });
	return createSubmission(db, {
		id: input.id,
		enrollmentId: input.enrollmentId,
		taskId: input.taskId,
		ownerUserId: user.id,
		mediaId: input.mediaId,
		note: input.note,
		deviceInfo: input.deviceInfo,
		geoLat: input.geoLat,
		geoLng: input.geoLng,
		submit: input.submit,
		ip: clientIp(),
	});
}
