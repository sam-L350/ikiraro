import { eq } from "drizzle-orm";
import { requireAuth } from "../../../core/auth/require-auth";
import type { CenterSummary } from "../../../core/geography/centers";
import {
	listAssignedCenters,
	listChoosableCenters,
} from "../../../core/geography/centers";
import { readAssignments } from "../../../core/identity/staff";
import { db } from "../../../db";
import { users } from "../../../db/schema";

/** Centers this person works at, and the centers they may choose when adding staff. */
export async function getCenters(): Promise<{
	assigned: CenterSummary[];
	centers: CenterSummary[];
}> {
	const user = await requireAuth();
	const [row] = await db
		.select({ centerId: users.centerId })
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);
	const homeCenterId = row?.centerId ?? null;
	const isAdmin = (await readAssignments(db, user.id)).some(
		(assignment) =>
			assignment.role === "platform_admin" && assignment.scopeType === "global",
	);
	return {
		assigned: await listAssignedCenters(db, user.id, homeCenterId),
		centers: await listChoosableCenters(db, user.id, homeCenterId, isAdmin),
	};
}
