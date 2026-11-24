import {
	type PlacementQuestionView,
	readPlacementQuestions,
} from "../../../../core/learning/pathways";
import { db } from "../../../../db";

/** The check a person can answer while registering. No account is required. */
export async function getPlacementQuestions(): Promise<{
	questions: PlacementQuestionView[];
}> {
	return readPlacementQuestions(db);
}
