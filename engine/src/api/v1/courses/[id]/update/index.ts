import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import type { CourseView } from "../../../../../core/content/author";
import { updateCourse } from "../../../../../core/content/author";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Replace the course title and summary in both languages. */
export async function updateCourseDraft(input: {
	id: string;
	titleEn: string;
	titleRw?: string;
	summaryEn?: string;
	summaryRw?: string;
}): Promise<CourseView> {
	const user = await requireAuth();
	await authorize({ permission: "content.write" });
	return updateCourse(db, {
		courseId: input.id,
		titleEn: input.titleEn,
		titleRw: input.titleRw,
		summaryEn: input.summaryEn,
		summaryRw: input.summaryRw,
		actorId: user.id,
		ip: clientIp(),
	});
}
