import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import {
	type RetentionView,
	readRetention,
} from "../../../core/identity/retention";
import { db } from "../../../db";

/** The stored photo period, or none. */
export async function getRetentionPolicy(): Promise<RetentionView> {
	const user = await requireAuth();
	return readRetention(db, { assignments: await loadAssignments(user.id) });
}
