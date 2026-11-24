import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import { type RepairRow, readItemCare } from "../../../core/hardware/repairs";
import { db } from "../../../db";

/** Repairs and the warranty date on one item. */
export async function getItemCare(input: {
	inventoryId: string;
}): Promise<{ repairs: RepairRow[]; warrantyEndsOn: string | null }> {
	const user = await requireAuth();
	return readItemCare(db, await loadAssignments(user.id), input.inventoryId);
}
