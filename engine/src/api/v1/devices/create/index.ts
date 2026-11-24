import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { createCenterDevice as saveCenterDevice } from "../../../../core/geography/devices";
import { clientIp } from "../../../../core/http/client-ip";
import { reviewCenters } from "../../../../core/learning/review-queue";
import { db } from "../../../../db";

/** Add a practice machine to a center. */
export async function createDevice(input: {
	centerId: string;
	kind: string;
	label: string;
	condition: string;
	availability: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	const centers = await reviewCenters(db, user.id);
	const center = centers.find((item) => item.id === input.centerId);
	if (!center) throw errors.notFound("That device was not found.");
	await authorize({
		permission: "submission.review",
		resource: { centerId: center.id, districtId: center.districtId },
	});
	return saveCenterDevice(db, {
		actorId: user.id,
		centerId: input.centerId,
		kind: input.kind,
		label: input.label,
		condition: input.condition,
		availability: input.availability,
		ip: clientIp(),
	});
}
