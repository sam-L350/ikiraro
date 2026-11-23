import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { listCenterLearners } from "../../../../core/learning/catalog";
import { db } from "../../../../db";

/** Learners whose home center is one this person can enroll. */
export async function getCatalogLearners(input: {
	centerId: string;
}): Promise<{ learners: { id: number; name: string }[] }> {
	await requireAuth();
	await authorize({
		permission: "learning.enroll",
		resource: { centerId: input.centerId },
	});
	return { learners: await listCenterLearners(db, input.centerId) };
}
