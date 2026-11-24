import { clientIp } from "../../../core/http/client-ip";
import type { ConsentPurpose } from "../../../core/identity/consent";
import { registerLearner } from "../../../core/identity/register";
import { smsSender } from "../../../core/sms/select";
import { db } from "../../../db";

/**
 * Self-registration. The account stays inactive until the learner's code.
 * Public: there is no session yet. The code is not in this response.
 */
export async function createRegistration(input: {
	name: string;
	phone: string;
	dateOfBirth: string;
	district: string;
	sector: string;
	village: string;
	economicSector: string;
	locale: "rw" | "en";
	email?: string;
	gender?: string;
	guardianContact?: string;
	consents: { purpose: ConsentPurpose; granted: boolean }[];
	placementChoiceIds?: string[];
}): Promise<{
	id: number;
	name: string;
	phone: string;
	active: false;
	codeSent: boolean;
	suggestion: {
		courseId: string;
		titleEn: string;
		titleRw: string;
	} | null;
}> {
	return registerLearner(db, { ...input, ip: clientIp() }, smsSender());
}
