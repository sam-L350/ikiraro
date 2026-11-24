import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { recordHandover } from "../../../../../core/hardware/handover";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";

/** Store the form, the acknowledgment, the photo, and the witness. */
export async function createHandover(input: {
	id: string;
	witnessUserId: number;
	acknowledgment: string;
	signatureMediaId?: string;
	code?: string;
	photoMediaId: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "hardware.manage" });
	return recordHandover(db, {
		actorId: user.id,
		grantId: input.id,
		witnessUserId: input.witnessUserId,
		acknowledgment: input.acknowledgment,
		signatureMediaId: input.signatureMediaId,
		code: input.code,
		photoMediaId: input.photoMediaId,
		ip: clientIp(),
	});
}
