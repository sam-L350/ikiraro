import { confirmFactor, type FactorState } from "../../../../core/auth/factors";
import { requireAuth } from "../../../../core/auth/require-auth";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Confirm the secret with the current code. */
export async function createStaffFactorConfirm(input: {
	code: string;
}): Promise<FactorState> {
	const user = await requireAuth();
	return confirmFactor(db, {
		userId: user.id,
		code: input.code,
		ip: clientIp(),
	});
}
