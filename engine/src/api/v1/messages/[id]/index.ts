import { requireAuth } from "../../../../core/auth/require-auth";
import { readThread } from "../../../../core/hardware/messages";
import { db } from "../../../../db";

/** The thread. Phone and email are included only after both people agree. */
export async function getMessageThread(input: { id: string }) {
	const user = await requireAuth();
	return readThread(db, { userId: user.id, requestId: input.id });
}
