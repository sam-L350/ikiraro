import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import { listMessageReview } from "../../../core/hardware/messages";
import { db } from "../../../db";

/** Retained messages and reports for an admin. */
export async function getMentorReview() {
	await requireAuth();
	await authorize({ permission: "admin.manage" });
	return listMessageReview(db);
}
