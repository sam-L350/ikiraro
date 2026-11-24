import { eq } from "drizzle-orm";
import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { confirmSurvey } from "../../../../../core/hardware/surveys";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";
import { outcomeSurveys, users } from "../../../../../db/schema";

/** Optional confirmation. The answers already stored are left as they are. */
export async function createSurveyConfirmation(input: {
	id: string;
	note: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	const [row] = await db
		.select({ centerId: users.centerId })
		.from(outcomeSurveys)
		.innerJoin(users, eq(users.id, outcomeSurveys.userId))
		.where(eq(outcomeSurveys.id, input.id))
		.limit(1);
	await authorize({
		permission: "submission.review",
		resource: { centerId: row?.centerId ?? undefined },
	});
	return confirmSurvey(db, {
		surveyId: input.id,
		actorId: user.id,
		note: input.note,
		ip: clientIp(),
	});
}
