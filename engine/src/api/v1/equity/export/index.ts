import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { exportEquity } from "../../../../core/hardware/equity";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** CSV of the same counts the viewer can see. Names are not in the file. */
export async function getEquityExport(): Promise<{ csv: string }> {
	const user = await requireAuth();
	return exportEquity(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		ip: clientIp(),
	});
}
