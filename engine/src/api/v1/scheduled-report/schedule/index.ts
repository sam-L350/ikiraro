import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	createReportSchedule,
	type ReportScheduleView,
} from "../../../../core/reports/reports";
import { db } from "../../../../db";

/** Store how many days pass before this district's report is emailed again. */
export async function createScheduledReport(input: {
	districtId: string;
	intervalDays: number;
}): Promise<ReportScheduleView> {
	const user = await requireAuth();
	return createReportSchedule(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		districtId: input.districtId,
		intervalDays: input.intervalDays,
		ip: clientIp(),
	});
}
