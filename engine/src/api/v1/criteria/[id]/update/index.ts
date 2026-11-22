import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import type { CourseView } from "../../../../../core/content/author";
import { updateCriterion } from "../../../../../core/content/author";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Replace a rubric row's weight and prompts. */
export async function updateCriterionDraft(input: {
	id: string;
	weight: number;
	promptEn: string;
	promptRw?: string;
}): Promise<CourseView> {
	const user = await requireAuth();
	await authorize({ permission: "content.write" });
	return updateCriterion(db, {
		criterionId: input.id,
		weight: input.weight,
		promptEn: input.promptEn,
		promptRw: input.promptRw,
		actorId: user.id,
		ip: clientIp(),
	});
}
