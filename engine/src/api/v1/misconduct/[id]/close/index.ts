import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import {
	closeConcern,
	loadMisconductViewer,
} from "../../../../../core/misconduct/reports";
import { db } from "../../../../../db";

/** Close a concern from outside the reporter's center. The note is not copied into the audit row. */
export async function createMisconductClose(input: {
	id: string;
	note: string;
}): Promise<{ id: string; status: "closed" }> {
	const user = await requireAuth();
	await authorize({ permission: "misconduct.review" });
	return closeConcern(db, {
		reportId: input.id,
		viewer: await loadMisconductViewer(db, user.id),
		note: input.note,
		ip: clientIp(),
	});
}
