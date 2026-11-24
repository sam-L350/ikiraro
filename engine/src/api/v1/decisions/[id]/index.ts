import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	type DecisionDetail,
	readDecisionRound,
} from "../../../../core/hardware/grants";
import { db } from "../../../../db";

/** One round, the latest ranking, and the items still in stock. */
export async function getDecisionRound(input: {
	id: string;
}): Promise<DecisionDetail> {
	await requireAuth();
	await authorize({ permission: "grant.decide" });
	return readDecisionRound(db, input.id);
}
