import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import { declineRoleChange } from "../../../../../core/support/approvals";
import { db } from "../../../../../db";

/** A different admin refuses the change. No role is added. */
export async function createAdminApprovalDecline(input: {
	id: string;
	note: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return declineRoleChange(db, {
		actorId: user.id,
		approvalId: input.id,
		note: input.note,
		ip: clientIp(),
	});
}
