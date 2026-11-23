import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { fileConcern } from "../../../../core/misconduct/reports";
import { db } from "../../../../db";

/** File a concern about a center the person belongs to. The body is not copied into the audit row. */
export async function createMisconduct(input: {
	centerId: string;
	kind: string;
	body: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "misconduct.file" });
	return fileConcern(db, {
		reporterId: user.id,
		centerId: input.centerId,
		kind: input.kind,
		body: input.body,
		ip: clientIp(),
	});
}
