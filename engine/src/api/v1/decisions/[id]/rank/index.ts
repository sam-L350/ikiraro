import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import type { GrantFormula } from "../../../../../core/hardware/formula";
import { rankRound } from "../../../../../core/hardware/grants";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Save the formula on the round and store the ranking it produces. */
export async function createDecisionRank(input: {
	id: string;
	formula: GrantFormula;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "grant.decide" });
	return rankRound(db, {
		actorId: user.id,
		roundId: input.id,
		formula: input.formula,
		ip: clientIp(),
	});
}
