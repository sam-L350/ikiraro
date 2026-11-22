import { errors } from "../../../../../core/api/error";
import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import {
	loadStaffContext,
	resetStaffPassword,
} from "../../../../../core/identity/staff";
import { db } from "../../../../../db";

/** Set a temporary password. The person must change it before doing anything else. */
export async function updateStaffPassword(input: {
	id: number;
	password: string;
}): Promise<{ reset: true }> {
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
	return resetStaffPassword(db, {
		actorId: user.id,
		userId: input.id,
		password: input.password,
		ip: clientIp(),
	});
}
