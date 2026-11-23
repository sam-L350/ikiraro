import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	type ConcernDetail,
	loadMisconductViewer,
	readConcern,
} from "../../../../core/misconduct/reports";
import { db } from "../../../../db";

/** One concern, when the reader filed it or reviews centers they do not work at. */
export async function getMisconduct(input: {
	id: string;
}): Promise<ConcernDetail> {
	const user = await requireAuth();
	const viewer = await loadMisconductViewer(db, user.id);
	if (viewer.admin || viewer.districtIds.length > 0) {
		await authorize({ permission: "misconduct.review" });
	} else {
		await authorize({ permission: "misconduct.file" });
	}
	return readConcern(db, { reportId: input.id, viewer });
}
