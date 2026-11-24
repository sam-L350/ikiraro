import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import {
	readReportSchedules,
	type ScheduledReportMeta,
} from "../../../core/reports/reports";
import { db } from "../../../db";

/** Districts this person can email, and the interval already stored for each. */
export async function getScheduledReport(): Promise<ScheduledReportMeta> {
	const user = await requireAuth();
	return readReportSchedules(db, await loadAssignments(user.id));
}
