import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	type PointAdjustmentView,
	requestPointAdjustment,
} from "../../../../core/learning/adjustments";
import { db } from "../../../../db";

/** Ask a second admin to add or remove points. The ledger is unchanged. */
export async function createPointAdjustment(input: {
	email: string;
	amount: number;
	reason: string;
}): Promise<PointAdjustmentView> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return requestPointAdjustment(db, {
		actorId: user.id,
		email: input.email,
		amount: input.amount,
		reason: input.reason,
		ip: clientIp(),
	});
}
