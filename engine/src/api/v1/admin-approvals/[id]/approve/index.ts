import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import { approveRoleChange } from "../../../../../core/support/approvals";
import { db } from "../../../../../db";

/** A different admin adds the roles. */
export async function createAdminApprovalDecision(input: {
	id: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return approveRoleChange(db, {
		actorId: user.id,
		approvalId: input.id,
		ip: clientIp(),
	});
}
