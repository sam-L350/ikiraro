import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { approveMentor } from "../../../../../core/hardware/mentors";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Approve someone else's application. */
export async function createMentorApproval(input: {
	id: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return approveMentor(db, {
		actorId: user.id,
		mentorId: input.id,
		ip: clientIp(),
	});
}
