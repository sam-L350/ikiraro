import { requireAuth } from "../../../../core/auth/require-auth";
import { clientIp } from "../../../../core/http/client-ip";
import { pinShowcase } from "../../../../core/learning/showcase";
import { db } from "../../../../db";

/** Pin one approved piece. Three is the most. */
export async function createShowcasePin(input: {
	submissionId: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return pinShowcase(db, {
		userId: user.id,
		submissionId: input.submissionId,
		ip: clientIp(),
	});
}
