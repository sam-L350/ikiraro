import { requireAuth } from "../../../../../core/auth/require-auth";
import { submitFollowUpEvidence } from "../../../../../core/hardware/follow-ups";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Optional photo of the device in use. A trainer reviews it like other evidence. */
export async function createFollowUpEvidence(input: {
	id: string;
	mediaId: string;
	note: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return submitFollowUpEvidence(db, {
		followUpId: input.id,
		actorId: user.id,
		mediaId: input.mediaId,
		note: input.note,
		ip: clientIp(),
	});
}
