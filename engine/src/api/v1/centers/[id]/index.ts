import { eq } from "drizzle-orm";
import { requireAuth } from "../../../../core/auth/require-auth";
import {
	type CenterSummary,
	readAssignedCenter,
} from "../../../../core/geography/centers";
import { db } from "../../../../db";
import { users } from "../../../../db/schema";

/** One center this person works at. A center outside that set stays hidden. */
export async function getCenter(input: { id: string }): Promise<CenterSummary> {
	const user = await requireAuth();
	const [row] = await db
		.select({ centerId: users.centerId })
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);
	return readAssignedCenter(db, user.id, row?.centerId ?? null, input.id);
}
