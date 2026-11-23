import { auditScope } from "../../../core/audit/scope";
import { type AuditRow, searchAuditLog } from "../../../core/audit/search";
import { requireAuth } from "../../../core/auth/require-auth";
import { authorize, loadAssignments } from "../../../core/authz/authorize";
import { db } from "../../../db";

/** Audit rows inside the viewer's centers, or the whole log for a global role. */
export async function searchAudit(input?: {
	action?: string;
	targetType?: string;
}): Promise<AuditRow[]> {
	const user = await requireAuth();
	await authorize({ permission: "audit.read" });
	return searchAuditLog(db, {
		scope: auditScope(await loadAssignments(user.id)),
		viewerId: user.id,
		filter: input ?? {},
	});
}
