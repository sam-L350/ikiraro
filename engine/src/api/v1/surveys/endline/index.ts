import { requireAuth } from "../../../../core/auth/require-auth";
import { recordEndline } from "../../../../core/hardware/surveys";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** The later survey. It is stored only after the baseline. */
export async function createSurveyEndline(input: {
	digitalConfidence: number;
	tasksDigital: number;
	income: number;
	services: string;
	jobsOrCustomers: number;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return recordEndline(db, { userId: user.id, answers: input, ip: clientIp() });
}
