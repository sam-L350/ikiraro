import { requireAuth } from "../../../../core/auth/require-auth";
import { applyToMentor } from "../../../../core/hardware/mentors";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Ask an admin to approve you. The weekly cap is the number you type. */
export async function createMentorApplication(input: {
	kind: string;
	weeklyContactCap: number;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return applyToMentor(db, {
		userId: user.id,
		kind: input.kind,
		weeklyContactCap: input.weeklyContactCap,
		ip: clientIp(),
	});
}
