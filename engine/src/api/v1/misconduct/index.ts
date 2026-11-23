import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	listOwnConcerns,
	type OwnConcern,
} from "../../../core/misconduct/reports";
import { db } from "../../../db";

/** Concerns the signed-in person filed. Other people's concerns stay hidden. */
export async function listMisconduct(): Promise<OwnConcern[]> {
	const user = await requireAuth();
	await authorize({ permission: "misconduct.file" });
	return listOwnConcerns(db, user.id);
}
