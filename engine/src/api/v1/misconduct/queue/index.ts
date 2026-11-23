import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	type ConcernSummary,
	listConcernQueue,
	loadMisconductViewer,
} from "../../../../core/misconduct/reports";
import { db } from "../../../../db";

/** Open concerns from centers the reviewer does not work at. */
export async function listMisconductQueue(): Promise<ConcernSummary[]> {
	const user = await requireAuth();
	await authorize({ permission: "misconduct.review" });
	return listConcernQueue(db, await loadMisconductViewer(db, user.id));
}
