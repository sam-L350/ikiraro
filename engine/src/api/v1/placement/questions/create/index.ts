import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { clientIp } from "../../../../../core/http/client-ip";
import { createPlacementQuestion } from "../../../../../core/learning/pathways";
import { db } from "../../../../../db";

/** Add one part of the check. Each choice names a published course. */
export async function createPlacementQuestionRecord(input: {
	promptEn: string;
	promptRw: string;
	choices: { labelEn: string; labelRw: string; courseId: string }[];
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "content.write" });
	return createPlacementQuestion(db, {
		...input,
		actorId: user.id,
		ip: clientIp(),
	});
}
