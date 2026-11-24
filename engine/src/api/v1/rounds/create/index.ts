import { isApiError } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { openRound } from "../../../../core/hardware/rounds";
import { clientIp } from "../../../../core/http/client-ip";
import type { EligibilityCriterion } from "../../../../core/learning/eligibility";
import { db } from "../../../../db";

/** Open a district round. The quantity and the rules are the ones typed here. */
export async function createRound(input: {
	districtId: string;
	title: string;
	quantity: number;
	opensAt: string;
	closesAt: string;
	criteria: EligibilityCriterion[];
}): Promise<{ id: string }> {
	const user = await requireAuth();
	try {
		await authorize({
			permission: "district.manage",
			resource: { districtId: input.districtId },
		});
	} catch (error) {
		if (!isApiError(error) || error.status !== 403) throw error;
		await authorize({ permission: "admin.manage" });
	}
	return openRound(db, {
		actorId: user.id,
		districtId: input.districtId,
		title: input.title,
		quantity: input.quantity,
		opensAt: input.opensAt,
		closesAt: input.closesAt,
		criteria: input.criteria,
		ip: clientIp(),
	});
}
