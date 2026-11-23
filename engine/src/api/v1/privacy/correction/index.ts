import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	type CorrectionField,
	correctSubject,
} from "../../../../core/identity/subject";
import { db } from "../../../../db";

function subjectId(actorId: number, requested: number | undefined): number {
	if (requested === undefined) return actorId;
	if (!Number.isInteger(requested) || requested < 1) {
		throw errors.badRequest("That person is not on the record.", {
			reason: "user",
		});
	}
	return requested;
}

/**
 * Writes one profile detail and keeps the previous value on the audit row.
 * A removed account cannot be corrected.
 */
export async function createPrivacyCorrection(input: {
	field: string;
	value: string;
	userId?: number;
}): Promise<{ field: CorrectionField; value: string | null }> {
	const user = await requireAuth();
	const id = subjectId(user.id, input.userId);
	if (id === user.id) {
		await authorize({
			permission: "profile.write.self",
			resource: { ownerId: String(user.id) },
		});
	} else {
		await authorize({ permission: "admin.manage" });
	}
	return correctSubject(db, {
		subjectId: id,
		actorId: user.id,
		field: input.field,
		value: input.value,
		ip: clientIp(),
	});
}
