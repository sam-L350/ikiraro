import { requireAuth } from "../../../../../core/auth/require-auth";
import { clientIp } from "../../../../../core/http/client-ip";
import { closeTicket } from "../../../../../core/support/tickets";
import { db } from "../../../../../db";

/** Close a report. The answer time stays if one was recorded. */
export async function createTicketClose(input: {
	id: string;
	note: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return closeTicket(db, {
		actorId: user.id,
		ticketId: input.id,
		note: input.note,
		ip: clientIp(),
	});
}
