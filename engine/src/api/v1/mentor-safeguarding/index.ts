import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import { listSafeguardingMentors } from "../../../core/hardware/messages";
import { db } from "../../../db";

/** Approved mentors and whether the extra check is recorded. */
export async function getMentorSafeguarding() {
	await requireAuth();
	await authorize({ permission: "admin.manage" });
	return { items: await listSafeguardingMentors(db) };
}
