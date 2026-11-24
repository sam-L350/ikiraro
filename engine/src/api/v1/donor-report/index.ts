import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import {
	type DonorReport,
	readDonorReport,
} from "../../../core/hardware/donor";
import { db } from "../../../db";

/** Totals, decisions, and outcomes inside this person's scope. */
export async function getDonorReport(): Promise<DonorReport> {
	const user = await requireAuth();
	return readDonorReport(db, await loadAssignments(user.id));
}
