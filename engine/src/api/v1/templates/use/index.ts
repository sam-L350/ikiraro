import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { copyTemplate } from "../../../../core/coverage/templates";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Copy a template into a new draft course. */
export async function createTemplateUse(input: {
	templateId: string;
}): Promise<{ courseId: string }> {
	const user = await requireAuth();
	return copyTemplate(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		templateId: input.templateId,
		ip: clientIp(),
	});
}
