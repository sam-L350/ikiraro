import { authorize } from "../../../core/authz/authorize";
import { listPendingMentors } from "../../../core/hardware/mentors";
import { db } from "../../../db";

/** Applications waiting for an admin. */
export async function getMentorApprovals() {
	await authorize({ permission: "admin.manage" });
	return { items: await listPendingMentors(db) };
}
