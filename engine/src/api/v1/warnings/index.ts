import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import { readWarnings, type WarningList } from "../../../core/reports/reports";
import { db } from "../../../db";

/** Learners who have gone quiet, and centers whose waiting evidence has grown. */
export async function getWarnings(): Promise<WarningList> {
	const user = await requireAuth();
	return readWarnings(db, await loadAssignments(user.id));
}
