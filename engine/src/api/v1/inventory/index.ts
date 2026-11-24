import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	type InventoryItem,
	listInventory,
} from "../../../core/hardware/inventory";
import { db } from "../../../db";

/** Items on the hardware register, and the centers that can hold them. */
export async function getInventory(input: {
	centerId?: string;
	status?: string;
}): Promise<{
	items: InventoryItem[];
	centers: { id: string; name: string }[];
}> {
	await requireAuth();
	await authorize({ permission: "hardware.manage" });
	return listInventory(db, {
		centerId: input.centerId,
		status: input.status,
	});
}
