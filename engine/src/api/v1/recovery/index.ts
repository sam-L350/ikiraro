import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	listRecoveries,
	type RecoveryGrant,
} from "../../../core/hardware/recovery";
import { db } from "../../../db";

/** Grants the hardware officer can attach conditions to, or take back. */
export async function getRecoveries(): Promise<{ grants: RecoveryGrant[] }> {
	await requireAuth();
	await authorize({ permission: "hardware.manage" });
	return { grants: await listRecoveries(db) };
}
