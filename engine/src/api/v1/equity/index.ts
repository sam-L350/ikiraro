import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import { type EquityReport, readEquity } from "../../../core/hardware/equity";
import { db } from "../../../db";

/** Funnel, equity slices, and donor batches inside the viewer's scope. */
export async function getEquity(): Promise<EquityReport> {
	const user = await requireAuth();
	return readEquity(db, await loadAssignments(user.id));
}
