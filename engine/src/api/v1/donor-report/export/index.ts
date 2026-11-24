import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { exportDonorReport } from "../../../../core/hardware/donor";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** One file. Names, phones, villages, and images are not in it. */
export async function getDonorReportExport(): Promise<{ csv: string }> {
	const user = await requireAuth();
	return exportDonorReport(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		ip: clientIp(),
	});
}
