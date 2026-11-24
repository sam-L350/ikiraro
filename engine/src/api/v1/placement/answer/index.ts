import { requireAuth } from "../../../../core/auth/require-auth";
import { clientIp } from "../../../../core/http/client-ip";
import {
	answerPlacement,
	type PlacementSuggestion,
} from "../../../../core/learning/pathways";
import { db } from "../../../../db";

/** Store this person's check and the course it suggests. */
export async function createPlacementAnswer(input: {
	choiceIds: string[];
}): Promise<PlacementSuggestion> {
	const user = await requireAuth();
	return answerPlacement(db, {
		userId: user.id,
		choiceIds: input.choiceIds,
		ip: clientIp(),
	});
}
