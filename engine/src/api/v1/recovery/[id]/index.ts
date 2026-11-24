import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	type RecoveryDetail,
	readRecovery,
} from "../../../../core/hardware/recovery";
import { db } from "../../../../db";

/** The conditions on one grant, and the recovery if it was stored. */
export async function getRecovery(input: {
	id: string;
}): Promise<RecoveryDetail> {
	await requireAuth();
	await authorize({ permission: "hardware.manage" });
	return readRecovery(db, input.id);
}
