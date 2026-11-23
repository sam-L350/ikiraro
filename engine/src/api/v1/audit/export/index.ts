import { auditScope } from "../../../../core/audit/scope";
import { exportAuditLog } from "../../../../core/audit/search";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize, loadAssignments } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** CSV of the same rows the viewer can search. The download itself is audited. */
export async function getAuditExport(input?: {
	action?: string;
	targetType?: string;
}): Promise<{ csv: string }> {
	const user = await requireAuth();
	await authorize({ permission: "audit.read" });
	return exportAuditLog(db, {
		scope: auditScope(await loadAssignments(user.id)),
		viewerId: user.id,
		filter: input ?? {},
		ip: clientIp(),
	});
}
