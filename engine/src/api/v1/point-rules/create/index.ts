import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	type PointRuleView,
	createPointRule as publishPointRule,
} from "../../../../core/learning/points";
import { db } from "../../../../db";

/** Publish the next point rule for a task, module, or course. */
export async function createPointRule(input: {
	targetType: string;
	targetId: string;
	points: number;
	weight: number;
}): Promise<PointRuleView> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return publishPointRule(db, {
		actorId: user.id,
		targetType: input.targetType,
		targetId: input.targetId,
		points: input.points,
		weight: input.weight,
	});
}
