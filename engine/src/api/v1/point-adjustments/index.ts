import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	listPointAdjustments,
	type PointAdjustmentView,
} from "../../../core/learning/adjustments";
import { db } from "../../../db";

/** Adjustment requests waiting for a second admin, then the latest decisions. */
export async function listPointAdjustmentsQueue(): Promise<
	PointAdjustmentView[]
> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return listPointAdjustments(db, user.id);
}
