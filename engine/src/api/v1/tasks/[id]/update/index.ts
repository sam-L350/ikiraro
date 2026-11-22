import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import type { CourseView } from "../../../../../core/content/author";
import { updateTask } from "../../../../../core/content/author";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Replace a task's words and evidence type. */
export async function updateTaskDraft(input: {
	id: string;
	titleEn: string;
	titleRw?: string;
	instructionsEn?: string;
	instructionsRw?: string;
	evidenceType?: string;
}): Promise<CourseView> {
	const user = await requireAuth();
	await authorize({ permission: "content.write" });
	return updateTask(db, {
		taskId: input.id,
		titleEn: input.titleEn,
		titleRw: input.titleRw,
		instructionsEn: input.instructionsEn,
		instructionsRw: input.instructionsRw,
		evidenceType: input.evidenceType,
		actorId: user.id,
		ip: clientIp(),
	});
}
