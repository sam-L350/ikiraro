import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import {
	approvePointAdjustment,
	type PointAdjustmentView,
} from "../../../../../core/learning/adjustments";
import { db } from "../../../../../db";

/** A different admin writes the one ledger row for this request. */
export async function createPointAdjustmentApproval(input: {
	id: string;
}): Promise<PointAdjustmentView> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return approvePointAdjustment(db, {
		id: input.id,
		actorId: user.id,
		ip: clientIp(),
	});
}
