import { startFactor } from "../../../../core/auth/factors";
import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Show a new authenticator secret once. */
export async function createStaffFactor(): Promise<{ secret: string }> {
	const user = await requireAuth();
	return startFactor(db, {
		userId: user.id,
		assignments: await loadAssignments(user.id),
		ip: clientIp(),
	});
}
