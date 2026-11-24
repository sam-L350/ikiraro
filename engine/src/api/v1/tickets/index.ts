import { requireAuth } from "../../../core/auth/require-auth";
import { listTickets, type TicketView } from "../../../core/support/tickets";
import { db } from "../../../db";

/** Reports this person filed, and the ones they may answer. */
export async function getTickets(): Promise<{
	mine: TicketView[];
	queue: TicketView[];
	canAnswer: boolean;
}> {
	const user = await requireAuth();
	return listTickets(db, user.id);
}
