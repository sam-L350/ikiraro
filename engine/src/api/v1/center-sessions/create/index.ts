import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { createCenterSession as saveCenterSession } from "../../../../core/learning/center-sessions";
import { reviewCenters } from "../../../../core/learning/review-queue";
import { db } from "../../../../db";

/** Put a session on a center schedule. */
export async function createCenterSession(input: {
	centerId: string;
	topic: string;
	courseId?: string;
	trainerUserId: number;
	startsAt: string;
	minutes: number;
	capacity: number;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	const centers = await reviewCenters(db, user.id);
	const center = centers.find((item) => item.id === input.centerId);
	if (!center) throw errors.notFound("That session was not found.");
	await authorize({
		permission: "submission.review",
		resource: { centerId: center.id, districtId: center.districtId },
	});
	return saveCenterSession(db, {
		actorId: user.id,
		centerId: input.centerId,
		topic: input.topic,
		courseId: input.courseId,
		trainerUserId: input.trainerUserId,
		startsAt: input.startsAt,
		minutes: input.minutes,
		capacity: input.capacity,
		ip: clientIp(),
	});
}
