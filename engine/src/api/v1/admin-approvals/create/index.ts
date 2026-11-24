import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	type RoleChangeInput,
	requestRoleChange,
} from "../../../../core/support/approvals";
import { db } from "../../../../db";

/** Ask a different admin before these roles are added. */
export async function createAdminApproval(input: {
	reason: string;
	changes: RoleChangeInput[];
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return requestRoleChange(db, {
		actorId: user.id,
		reason: input.reason,
		changes: input.changes,
		ip: clientIp(),
	});
}
