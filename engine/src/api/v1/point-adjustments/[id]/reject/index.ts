import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import {
	type PointAdjustmentView,
	rejectPointAdjustment,
} from "../../../../../core/learning/adjustments";
import { db } from "../../../../../db";

/** Turn the request down. No ledger row is written. */
export async function createPointAdjustmentRejection(input: {
	id: string;
	reason: string;
}): Promise<PointAdjustmentView> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return rejectPointAdjustment(db, {
		id: input.id,
		actorId: user.id,
		reason: input.reason,
		ip: clientIp(),
	});
}
