import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import {
	type CoverageRow,
	readCoverage,
} from "../../../core/coverage/coverage";
import { db } from "../../../db";

/** Sectors with no center, and where their learners already train. */
export async function getCoverage(): Promise<{ sectors: CoverageRow[] }> {
	const user = await requireAuth();
	return readCoverage(db, await loadAssignments(user.id));
}
