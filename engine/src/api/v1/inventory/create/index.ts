import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { createInventoryItem as saveInventoryItem } from "../../../../core/hardware/inventory";
import { clientIp } from "../../../../core/http/client-ip";
import type { EligibilityCriterion } from "../../../../core/learning/eligibility";
import { db } from "../../../../db";

/** Add an item. It starts in stock, and that first status is kept in the history. */
export async function createInventoryItem(input: {
	name: string;
	category: string;
	serial: string;
	condition: string;
	centerId: string;
	donor?: string;
	acquiredOn: string;
	criteria: EligibilityCriterion[];
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "hardware.manage" });
	return saveInventoryItem(db, {
		actorId: user.id,
		name: input.name,
		category: input.category,
		serial: input.serial,
		condition: input.condition,
		centerId: input.centerId,
		donor: input.donor,
		acquiredOn: input.acquiredOn,
		criteria: input.criteria,
		ip: clientIp(),
	});
}
