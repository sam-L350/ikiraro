import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import {
	type CourseView,
	openNextDraft,
} from "../../../../../core/content/author";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Start the next draft of a published course. The pinned version is left alone. */
export async function createCourseDraftRevision(input: {
	id: string;
}): Promise<CourseView> {
	const user = await requireAuth();
	await authorize({ permission: "content.write" });
	return openNextDraft(db, {
		courseId: input.id,
		actorId: user.id,
		ip: clientIp(),
	});
}
