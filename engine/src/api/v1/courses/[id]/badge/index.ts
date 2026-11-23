import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import type { CourseView } from "../../../../../core/content/author";
import { saveBadge } from "../../../../../core/content/author";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Save the badge rule on a draft. Publishing copies it onto the course version. */
export async function updateCourseBadge(input: {
	id: string;
	titleEn: string;
	titleRw?: string;
	skillEn?: string;
	skillRw?: string;
	level: number;
	allRequiredTasksApproved: boolean;
	minimumScore?: number | null;
	minimumHours?: number | null;
	requiresInPerson?: boolean;
}): Promise<CourseView> {
	const user = await requireAuth();
	await authorize({ permission: "content.write" });
	return saveBadge(db, {
		courseId: input.id,
		titleEn: input.titleEn,
		titleRw: input.titleRw,
		skillEn: input.skillEn,
		skillRw: input.skillRw,
		level: input.level,
		allRequiredTasksApproved: input.allRequiredTasksApproved,
		minimumScore: input.minimumScore,
		minimumHours: input.minimumHours,
		requiresInPerson: input.requiresInPerson,
		actorId: user.id,
		ip: clientIp(),
	});
}
