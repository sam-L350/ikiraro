import { errors } from "../../../../../core/api/error";
import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import {
	deactivateStaff,
	loadStaffContext,
} from "../../../../../core/identity/staff";
import { db } from "../../../../../db";

/** An admin or center manager switches another staff account off. */
export async function createStaffDeactivation(input: {
	id: number;
}): Promise<{ deactivated: true }> {
	const user = await requireAuth();
	const context = await loadStaffContext(db, user.id);
	if (context.mode === "none") {
		throw errors.forbidden("You cannot change that account.", {
			reason: "role_ceiling",
		});
	}
	await authorize({
		permission: context.mode === "admin" ? "admin.manage" : "center.manage",
		resource: context.mode === "center" ? { centerId: context.centers[0] } : {},
	});
	return deactivateStaff(db, {
		actorId: user.id,
		userId: input.id,
		ip: clientIp(),
	});
}
