import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import { clientIp } from "../../../core/http/client-ip";
import {
	type ConsentPurpose,
	recordConsent,
	type StoredConsent,
} from "../../../core/identity/consent";
import { db } from "../../../db";

/**
 * Records a new consent decision. Withdrawal inserts a row and does not edit
 * the earlier one.
 */
export async function createConsent(input: {
	purpose: ConsentPurpose;
	granted: boolean;
}): Promise<StoredConsent> {
	const user = await requireAuth();
	await authorize({
		permission: "profile.write.self",
		resource: { ownerId: String(user.id) },
	});
	return recordConsent(db, {
		userId: user.id,
		purpose: input.purpose,
		granted: input.granted,
		ip: clientIp(),
	});
}
