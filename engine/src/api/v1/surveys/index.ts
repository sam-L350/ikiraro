import { requireAuth } from "../../../core/auth/require-auth";
import { readSurveys, type SurveyPair } from "../../../core/hardware/surveys";
import { db } from "../../../db";

/** The signed-in learner's baseline, endline, and the change. */
export async function getSurveys(): Promise<SurveyPair> {
	const user = await requireAuth();
	return readSurveys(db, user.id);
}
