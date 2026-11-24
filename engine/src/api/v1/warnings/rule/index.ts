import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	createWarningRule,
	type WarningRuleView,
} from "../../../../core/reports/reports";
import { db } from "../../../../db";

/** How many quiet days count as a drop-out warning in this district. */
export async function createWarningRuleForDistrict(input: {
	districtId: string;
	quietDays: number;
}): Promise<WarningRuleView> {
	const user = await requireAuth();
	return createWarningRule(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		districtId: input.districtId,
		quietDays: input.quietDays,
		ip: clientIp(),
	});
}
