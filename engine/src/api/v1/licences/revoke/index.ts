import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { revokeLicenceSeat } from "../../../../core/portable/portable";
import { db } from "../../../../db";

/** Free a seat. The grant stays in the record. */
export async function createLicenceRevocation(input: {
	grantId: string;
}): Promise<{ grantId: string }> {
	const user = await requireAuth();
	return revokeLicenceSeat(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		grantId: input.grantId,
		ip: clientIp(),
	});
}
