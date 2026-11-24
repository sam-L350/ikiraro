import { requireAuth } from "../../../../core/auth/require-auth";
import { clientIp } from "../../../../core/http/client-ip";
import { fileTicket } from "../../../../core/support/tickets";
import { db } from "../../../../db";

/** Report a problem with the app, a course, or someone's conduct. */
export async function createTicket(input: {
	kind: string;
	body: string;
	mediaId?: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return fileTicket(db, {
		actorId: user.id,
		kind: input.kind,
		body: input.body,
		mediaId: input.mediaId,
		ip: clientIp(),
	});
}
