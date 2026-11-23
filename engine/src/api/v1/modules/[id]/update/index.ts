import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import type { CourseView } from "../../../../../core/content/author";
import { updateModule } from "../../../../../core/content/author";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Replace a module's title and summary in both languages. */
export async function updateModuleDraft(input: {
	id: string;
	titleEn: string;
	titleRw?: string;
	summaryEn?: string;
	summaryRw?: string;
	requires?: string[];
}): Promise<CourseView> {
	const user = await requireAuth();
	await authorize({ permission: "content.write" });
	return updateModule(db, {
		moduleId: input.id,
		titleEn: input.titleEn,
		titleRw: input.titleRw,
		summaryEn: input.summaryEn,
		summaryRw: input.summaryRw,
		requires: input.requires,
		actorId: user.id,
		ip: clientIp(),
	});
}
