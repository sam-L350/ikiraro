import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	type ApprovalView,
	listRoleChanges,
} from "../../../core/support/approvals";
import { db } from "../../../db";

/** Role changes waiting for a second admin. */
export async function getAdminApprovals(): Promise<ApprovalView[]> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return listRoleChanges(db, user.id);
}
