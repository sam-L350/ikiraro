import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	type InventoryDetail,
	readInventory,
} from "../../../../core/hardware/inventory";
import { db } from "../../../../db";

/** One item and the status history that was added after it. */
export async function getInventoryItem(input: {
	id: string;
}): Promise<InventoryDetail> {
	await requireAuth();
	await authorize({ permission: "hardware.read" });
	return readInventory(db, input.id);
}
