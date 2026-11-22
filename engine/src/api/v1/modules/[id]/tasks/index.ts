import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import type { CourseView } from "../../../../../core/content/author";
import { createTask } from "../../../../../core/content/author";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Add a task to a draft module. */
export async function createModuleTask(input: {
	id: string;
	titleEn: string;
	titleRw?: string;
	instructionsEn?: string;
	instructionsRw?: string;
	evidenceType?: string;
}): Promise<CourseView> {
	const user = await requireAuth();
	await authorize({ permission: "content.write" });
	return createTask(db, {
		moduleId: input.id,
		titleEn: input.titleEn,
		titleRw: input.titleRw,
		instructionsEn: input.instructionsEn,
		instructionsRw: input.instructionsRw,
		evidenceType: input.evidenceType,
		actorId: user.id,
		ip: clientIp(),
	});
}
