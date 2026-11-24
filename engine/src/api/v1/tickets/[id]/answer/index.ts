import { requireAuth } from "../../../../../core/auth/require-auth";
import { clientIp } from "../../../../../core/http/client-ip";
import { answerTicket } from "../../../../../core/support/tickets";
import { db } from "../../../../../db";

/** Answer a report. The first answer keeps its time. */
export async function createTicketAnswer(input: {
	id: string;
	note: string;
}): Promise<{ id: string; minutes: number }> {
	const user = await requireAuth();
	return answerTicket(db, {
		actorId: user.id,
		ticketId: input.id,
		note: input.note,
		ip: clientIp(),
	});
}
