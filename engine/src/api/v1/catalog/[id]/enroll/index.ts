import { eq } from "drizzle-orm";
import { errors } from "../../../../../core/api/error";
import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import type { EnrollmentView } from "../../../../../core/learning/catalog";
import { enrollInCourse } from "../../../../../core/learning/catalog";
import { db } from "../../../../../db";
import { users } from "../../../../../db/schema";

/** Pin the learner to the latest published version, at their home center. */
export async function createCatalogEnrollment(input: {
	id: string;
	learnerId?: number;
	centerId?: string;
}): Promise<EnrollmentView> {
	const user = await requireAuth();
	const learnerId = input.learnerId;
	if (learnerId !== undefined && learnerId !== user.id) {
		if (!input.centerId) {
			throw errors.badRequest("Choose the learner's home center.", {
				reason: "center_required",
			});
		}
		await authorize({
			permission: "learning.enroll",
			resource: {
				ownerId: String(learnerId),
				centerId: input.centerId,
			},
		});
		return enrollInCourse(db, {
			userId: learnerId,
			courseId: input.id,
			centerId: input.centerId,
			actorId: user.id,
			ip: clientIp(),
		});
	}
	await authorize({
		permission: "learning.enroll",
		resource: { ownerId: String(user.id) },
	});
	const [person] = await db
		.select({ centerId: users.centerId })
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);
	if (!person?.centerId) {
		throw errors.conflict("This learner has no home center.", {
			reason: "center_required",
		});
	}
	return enrollInCourse(db, {
		userId: user.id,
		courseId: input.id,
		centerId: person.centerId,
		actorId: user.id,
		ip: clientIp(),
	});
}
