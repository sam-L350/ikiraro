import { requireAuth } from "../../../../core/auth/require-auth";
import { clientIp } from "../../../../core/http/client-ip";
import type { ConsentPurpose } from "../../../../core/identity/consent";
import { registerLearner } from "../../../../core/identity/register";
import { requireRegistrar } from "../../../../core/identity/registrar";
import { logSmsSender } from "../../../../core/sms/sender";
import { db } from "../../../../db";

/**
 * A trainer registers a learner. The record stores the trainer and stays
 * inactive until the learner confirms with a one-time code.
 */
export async function createRegistrationAssisted(input: {
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
}): Promise<{
	id: number;
	name: string;
	phone: string;
	active: false;
	codeSent: boolean;
	assistedBy: string | null;
}> {
	const trainer = await requireAuth();
	const registrar = await requireRegistrar(db, trainer.id);
	const created = await registerLearner(
		db,
		{ ...input, createdByUserId: trainer.id, ip: clientIp() },
		logSmsSender,
	);
	return { ...created, assistedBy: registrar.name };
}
