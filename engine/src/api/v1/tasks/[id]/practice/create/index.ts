import { requireAuth } from "../../../../../../core/auth/require-auth";
import { clientIp } from "../../../../../../core/http/client-ip";
import {
	createPractice,
	type PracticeSample,
} from "../../../../../../core/learning/peer";
import { db } from "../../../../../../db";

/** Store the sample a learner rehearses with. The newest row is the sample. */
export async function createTaskPractice(input: {
	id: string;
	titleEn: string;
	titleRw: string;
	bodyEn: string;
	bodyRw: string;
}): Promise<PracticeSample> {
	const user = await requireAuth();
	return createPractice(db, {
		actorId: user.id,
		taskId: input.id,
		titleEn: input.titleEn,
		titleRw: input.titleRw,
		bodyEn: input.bodyEn,
		bodyRw: input.bodyRw,
		ip: clientIp(),
	});
}
