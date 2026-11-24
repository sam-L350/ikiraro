import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { recordSafeguarding } from "../../../../core/hardware/messages";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** An admin records the extra check for someone else. */
export async function createMentorSafeguarding(input: {
	mentorUserId: number;
	note: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return recordSafeguarding(db, {
		actorId: user.id,
		mentorUserId: input.mentorUserId,
		note: input.note,
		ip: clientIp(),
	});
}
