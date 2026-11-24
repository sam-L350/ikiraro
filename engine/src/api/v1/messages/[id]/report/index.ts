import { requireAuth } from "../../../../../core/auth/require-auth";
import { reportMentorMessage } from "../../../../../core/hardware/messages";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Report one message. The message stays stored. */
export async function createMessageReport(input: {
	id: string;
	note: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return reportMentorMessage(db, {
		userId: user.id,
		messageId: input.id,
		note: input.note,
		ip: clientIp(),
	});
}
