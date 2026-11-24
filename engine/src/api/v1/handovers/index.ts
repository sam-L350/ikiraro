import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	type HandoverGrant,
	listHandovers,
} from "../../../core/hardware/handover";
import { db } from "../../../db";

/** Active grants, and whether the handover is already stored. */
export async function getHandovers(): Promise<{ grants: HandoverGrant[] }> {
	await requireAuth();
	await authorize({ permission: "hardware.manage" });
	return { grants: await listHandovers(db) };
}
