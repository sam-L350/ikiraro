import { eq } from "drizzle-orm";
import type { Database } from "../../db";
import { users } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import type { SmsSender } from "../sms/sender";
import {
	consumeOtpChallenge,
	createOtp,
	readMatchingOtp,
	type SignedInUser,
} from "./login";
import { createSession } from "./sessions";

type RecoveryDb = Pick<Database, "insert" | "select" | "update">;

/** Sends a recovery code. The send is rate-limited, and an unknown phone still answers the same way. */
export async function requestRecovery(
	database: RecoveryDb,
	input: { phone: string; ip: string },
	sender: SmsSender,
): Promise<{ sent: true }> {
	return createOtp(database, input, sender);
}

/**
 * Opens a session from a recovery code. Repeated wrong codes lock the phone.
 * A deactivated account is opened again. A removed account is not.
 */
export async function recoverSession(
	database: RecoveryDb,
	input: { phone: string; code: string; ip: string; sharedDevice?: boolean },
): Promise<{ token: string; user: SignedInUser }> {
	const matched = await readMatchingOtp(database, input);
	if (!matched.user.activatedAt) {
		throw errors.badRequest(
			"This account is not active yet. Enter the code to finish registration.",
			{ reason: "not_active" },
		);
	}

	await consumeOtpChallenge(database, matched.challengeId);
	if (matched.user.deactivatedAt) {
		await database
			.update(users)
			.set({ deactivatedAt: null })
			.where(eq(users.id, matched.user.id));
	}

	const token = await createSession(matched.user.id, database, {
		sharedDevice: input.sharedDevice === true,
	});
	const user: SignedInUser = {
		id: matched.user.id,
		email: matched.user.email,
		name: matched.user.name,
	};
	await writeAudit(database, {
		actorId: user.id,
		action: "auth.recovered",
		targetType: "user",
		targetId: String(user.id),
		ipAddress: input.ip,
		metadata: { method: "otp" },
	});
	return { token, user };
}
