import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { fileAppeal } from "../../../../core/learning/appeals";
import { db } from "../../../../db";

/** Ask once for a different person to read a rejection. */
export async function createAppeal(input: {
	submissionId: string;
	note: string;
}): Promise<{ id: string; status: "open" }> {
	const user = await requireAuth();
	await authorize({
		permission: "learning.progress",
		resource: { ownerId: String(user.id) },
	});
	return fileAppeal(db, {
		learnerId: user.id,
		submissionId: input.submissionId,
		note: input.note,
		ip: clientIp(),
	});
}
