import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { declineMentor } from "../../../../../core/hardware/mentors";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Decline someone else's application and keep the reason. */
export async function createMentorDecline(input: {
	id: string;
	note: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return declineMentor(db, {
		actorId: user.id,
		mentorId: input.id,
		note: input.note,
		ip: clientIp(),
	});
}
