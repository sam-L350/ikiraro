import { requireAuth } from "../../../../core/auth/require-auth";
import { withdrawMentorOptIn } from "../../../../core/hardware/mentors";
import { db } from "../../../../db";

/** Stop being discoverable for one choice. */
export async function createMentorOptOut(input: {
	id: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return withdrawMentorOptIn(db, { userId: user.id, optInId: input.id });
}
