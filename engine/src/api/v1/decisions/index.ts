import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	type DecisionRound,
	listDecisionRounds,
} from "../../../core/hardware/grants";
import { db } from "../../../db";

/** Rounds the committee can rank and decide. */
export async function getDecisions(): Promise<{ rounds: DecisionRound[] }> {
	await requireAuth();
	await authorize({ permission: "grant.decide" });
	return { rounds: await listDecisionRounds(db) };
}
