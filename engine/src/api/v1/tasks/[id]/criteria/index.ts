import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import type { CourseView } from "../../../../../core/content/author";
import { createCriterion } from "../../../../../core/content/author";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Add one weighted rubric row to a draft task. */
export async function createTaskCriterion(input: {
	id: string;
	weight: number;
	passThreshold?: number;
	promptEn: string;
	promptRw?: string;
}): Promise<CourseView> {
	const user = await requireAuth();
	await authorize({ permission: "content.write" });
	return createCriterion(db, {
		taskId: input.id,
		weight: input.weight,
		passThreshold: input.passThreshold,
		promptEn: input.promptEn,
		promptRw: input.promptRw,
		actorId: user.id,
		ip: clientIp(),
	});
}
