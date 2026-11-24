import { errors } from "../../../core/api/error";
import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	type CenterDevice,
	listCenterDevices,
} from "../../../core/geography/devices";
import { reviewCenters } from "../../../core/learning/review-queue";
import { db } from "../../../db";

/** Practice machines at the centers this person trains, manages, or coordinates. */
export async function getDevices(input: { centerId?: string }): Promise<{
	items: CenterDevice[];
	centers: { id: string; name: string }[];
	canCreate: boolean;
}> {
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
	return listCenterDevices(db, { actorId: user.id, centerId: input.centerId });
}
