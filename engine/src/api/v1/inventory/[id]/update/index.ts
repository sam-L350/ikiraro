import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import {
	type InventoryDetail,
	updateInventoryItem as saveInventoryItem,
} from "../../../../../core/hardware/inventory";
import { clientIp } from "../../../../../core/http/client-ip";
import type { EligibilityCriterion } from "../../../../../core/learning/eligibility";
import { db } from "../../../../../db";

/** Change the current item. A new status or center is added to the history. */
export async function updateInventoryItem(input: {
	id: string;
	condition: string;
	status: string;
	centerId: string;
	donor?: string;
	note?: string;
	criteria: EligibilityCriterion[];
}): Promise<InventoryDetail> {
	const user = await requireAuth();
	await authorize({ permission: "hardware.manage" });
	return saveInventoryItem(db, {
		actorId: user.id,
		itemId: input.id,
		condition: input.condition,
		status: input.status,
		centerId: input.centerId,
		donor: input.donor,
		note: input.note,
		criteria: input.criteria,
		ip: clientIp(),
	});
}
