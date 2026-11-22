import { requireAuth } from "../../../../core/auth/require-auth";
import { clientIp } from "../../../../core/http/client-ip";
import { changeOwnPassword } from "../../../../core/identity/staff";
import { db } from "../../../../db";

/**
 * Replace the signed-in person's password. This is allowed while a temporary
 * password still has to be changed. Other routes are not.
 */
export async function updateAuthPassword(input: {
	currentPassword: string;
	nextPassword: string;
}): Promise<{ changed: true }> {
	const user = await requireAuth();
	return changeOwnPassword(db, {
		userId: user.id,
		currentPassword: input.currentPassword,
		nextPassword: input.nextPassword,
		ip: clientIp(),
	});
}
