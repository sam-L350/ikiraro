import { requireAuth } from "../../../../core/auth/require-auth";
import { optInToMentors } from "../../../../core/hardware/mentors";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Become discoverable for one skill in one district. */
export async function createMentorOptIn(input: {
	skill: string;
	districtId: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return optInToMentors(db, {
		userId: user.id,
		skill: input.skill,
		districtId: input.districtId,
		ip: clientIp(),
	});
}
