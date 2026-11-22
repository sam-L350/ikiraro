import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import type { CourseView } from "../../../../core/content/author";
import { createCourse } from "../../../../core/content/author";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Start a draft course in English and, when it is written, Kinyarwanda. */
export async function createCourseDraft(input: {
	titleEn: string;
	titleRw?: string;
	summaryEn?: string;
	summaryRw?: string;
}): Promise<CourseView> {
	const user = await requireAuth();
	await authorize({ permission: "content.write" });
	return createCourse(db, {
		...input,
		actorId: user.id,
		ip: clientIp(),
	});
}
