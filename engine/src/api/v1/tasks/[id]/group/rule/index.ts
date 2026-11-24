import { requireAuth } from "../../../../../../core/auth/require-auth";
import { clientIp } from "../../../../../../core/http/client-ip";
import { createGroupRule } from "../../../../../../core/learning/peer";
import { db } from "../../../../../../db";

/** Store the sentence that says what each person must do. */
export async function createTaskGroupRule(input: {
	id: string;
	ruleEn: string;
	ruleRw: string;
}): Promise<{ ruleEn: string; ruleRw: string }> {
	const user = await requireAuth();
	return createGroupRule(db, {
		actorId: user.id,
		taskId: input.id,
		ruleEn: input.ruleEn,
		ruleRw: input.ruleRw,
		ip: clientIp(),
	});
}
