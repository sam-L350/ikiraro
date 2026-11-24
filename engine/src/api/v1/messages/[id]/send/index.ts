import { requireAuth } from "../../../../../core/auth/require-auth";
import { sendMentorMessage } from "../../../../../core/hardware/messages";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Send a message on an accepted match. */
export async function createMessage(input: {
	id: string;
	body: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return sendMentorMessage(db, {
		userId: user.id,
		requestId: input.id,
		body: input.body,
		ip: clientIp(),
	});
}
