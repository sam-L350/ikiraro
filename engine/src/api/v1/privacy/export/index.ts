import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	exportSubject,
	type SubjectExport,
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

/** The signed-in person's record, or another person's when an admin asks. */
export async function getPrivacyExport(input?: {
	userId?: number;
}): Promise<SubjectExport> {
	const user = await requireAuth();
	const id = subjectId(user.id, input?.userId);
	if (id === user.id) {
		await authorize({
			permission: "profile.read.self",
			resource: { ownerId: String(user.id) },
		});
	} else {
		await authorize({ permission: "admin.manage" });
	}
	return exportSubject(db, { subjectId: id, actorId: user.id, ip: clientIp() });
}
