import { eq } from "drizzle-orm";
import { errors } from "../../../../../core/api/error";
import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { decideAccess } from "../../../../../core/authz/decide";
import { clientIp } from "../../../../../core/http/client-ip";
import { readAssignments } from "../../../../../core/identity/staff";
import { reverseAward } from "../../../../../core/learning/reverse";
import { db } from "../../../../../db";
import {
	enrollments,
	learningCenters,
	sectors,
	submissionVerifications,
	taskSubmissions,
} from "../../../../../db/schema";

/** Undo an approval. A coordinator or an admin, and only by new rows. */
export async function createVerificationRevocation(input: {
	id: string;
	reason: string;
	idempotencyKey: string;
	suspendReviewer?: boolean;
}): Promise<{
	id: string;
	verificationId: string;
	points: number;
	verifiedMinutes: number;
	badgeRevoked: boolean;
	reviewerSuspended: boolean;
}> {
	const user = await requireAuth();
	const [row] = await db
		.select({ districtId: sectors.districtId })
		.from(submissionVerifications)
		.innerJoin(
			taskSubmissions,
			eq(taskSubmissions.id, submissionVerifications.submissionId),
		)
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.innerJoin(learningCenters, eq(learningCenters.id, enrollments.centerId))
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(eq(submissionVerifications.id, input.id))
		.limit(1);
	if (!row) throw errors.notFound("That approval was not found.");
	const assignments = await readAssignments(db, user.id);
	const actorId = String(user.id);
	const admin = decideAccess({
		actorId,
		assignments,
		permission: "admin.manage",
		resource: {},
	});
	const coordinator = decideAccess({
		actorId,
		assignments,
		permission: "district.manage",
		resource: { districtId: row.districtId },
	});
	if (!admin.ok && !coordinator.ok) {
		await authorize({
			permission: "admin.manage",
			resource: { districtId: row.districtId },
		});
	}
	return reverseAward(db, {
		verificationId: input.id,
		actorId: user.id,
		reason: input.reason,
		idempotencyKey: input.idempotencyKey,
		suspendReviewer: input.suspendReviewer === true,
		ip: clientIp(),
	});
}
