import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import {
	type DuplicateList,
	readDuplicates,
} from "../../../core/identity/duplicates";
import { db } from "../../../db";

/** Possible duplicates and merges waiting for a second admin. */
export async function getAccountDuplicates(): Promise<DuplicateList> {
	const user = await requireAuth();
	return readDuplicates(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
	});
}
