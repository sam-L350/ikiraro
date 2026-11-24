import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	createLicence,
	type LicenceRow,
} from "../../../../core/portable/portable";
import { db } from "../../../../db";

/** Store a donated program with a seat count and an end date. */
export async function createSoftwareLicence(input: {
	name: string;
	seats: number;
	expiresOn: string;
}): Promise<LicenceRow> {
	const user = await requireAuth();
	return createLicence(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		name: input.name,
		seats: input.seats,
		expiresOn: input.expiresOn,
		ip: clientIp(),
	});
}
