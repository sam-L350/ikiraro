import { requireAuth } from "../../../../core/auth/require-auth";
import { postOpportunity } from "../../../../core/hardware/opportunities";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** An approved partner posts a job, apprenticeship, contract, or training. */
export async function createOpportunity(input: {
	kind: string;
	title: string;
	skill: string;
	body: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return postOpportunity(db, {
		userId: user.id,
		kind: input.kind,
		title: input.title,
		skill: input.skill,
		body: input.body,
		ip: clientIp(),
	});
}
