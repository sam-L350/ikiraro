import { errors } from "../../../../../core/api/error";
import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import {
	type CenterDevice,
	updateCenterDevice as saveCenterDevice,
} from "../../../../../core/geography/devices";
import { clientIp } from "../../../../../core/http/client-ip";
import { reviewCenters } from "../../../../../core/learning/review-queue";
import { db } from "../../../../../db";

/** Change a machine's condition or whether it is free. */
export async function updateDevice(input: {
	id: string;
	condition: string;
	availability: string;
}): Promise<CenterDevice> {
	const user = await requireAuth();
	const centers = await reviewCenters(db, user.id);
	const first = centers[0];
	if (!first) {
		await authorize({
			permission: "submission.review",
			resource: { ownerId: String(user.id) },
		});
		throw errors.forbidden("You do not keep devices for a center.");
	}
	await authorize({
		permission: "submission.review",
		resource: { centerId: first.id, districtId: first.districtId },
	});
	return saveCenterDevice(db, {
		actorId: user.id,
		deviceId: input.id,
		condition: input.condition,
		availability: input.availability,
		ip: clientIp(),
	});
}
