import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	listPointStatement,
	type PointStatement,
} from "../../../../core/learning/points";
import { db } from "../../../../db";

/** The signed-in person's ledger, and the sum of it. */
export async function getPointStatement(): Promise<PointStatement> {
	const user = await requireAuth();
	await authorize({
		permission: "learning.progress",
		resource: { ownerId: String(user.id) },
	});
	return listPointStatement(db, user.id);
}
