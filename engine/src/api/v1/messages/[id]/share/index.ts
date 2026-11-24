import { requireAuth } from "../../../../../core/auth/require-auth";
import { shareMentorContact } from "../../../../../core/hardware/messages";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Agree to show your phone and email. The other person must agree too. */
export async function createMessageShare(input: {
	id: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return shareMentorContact(db, {
		userId: user.id,
		requestId: input.id,
		ip: clientIp(),
	});
}
