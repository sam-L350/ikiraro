import { readOwnLock } from "../../../../core/auth/login";
import { requireAuth } from "../../../../core/auth/require-auth";
import { db } from "../../../../db";

/** Whether this account is locked out of sign-in. */
export async function getAuthLockout(): Promise<{
	locked: boolean;
	until: string | null;
}> {
	const user = await requireAuth();
	return readOwnLock(db, { email: user.email, phone: user.phone });
}
