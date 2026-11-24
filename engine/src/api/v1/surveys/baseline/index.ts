import { requireAuth } from "../../../../core/auth/require-auth";
import { recordBaseline } from "../../../../core/hardware/surveys";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** The starting survey. Someone who registered earlier can still fill it in. */
export async function createSurveyBaseline(input: {
	digitalConfidence: number;
	tasksDigital: number;
	income: number;
	services: string;
	jobsOrCustomers: number;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return recordBaseline(db, {
		userId: user.id,
		answers: input,
		ip: clientIp(),
	});
}
