import { requireAuth } from "../../../../../core/auth/require-auth";
import { blockMentorMatch } from "../../../../../core/hardware/messages";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Either person blocks the match. */
export async function createMessageBlock(input: {
	id: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return blockMentorMatch(db, {
		userId: user.id,
		requestId: input.id,
		ip: clientIp(),
	});
}
