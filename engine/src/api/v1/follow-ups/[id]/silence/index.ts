import { eq } from "drizzle-orm";
import { isApiError } from "../../../../../core/api/error";
import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { recordSilence } from "../../../../../core/hardware/follow-ups";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";
import {
	districts,
	followUps,
	hardwareGrants,
	learningCenters,
	sectors,
	users,
} from "../../../../../db/schema";

/** Mark the 180 day check-in unanswered so a review opens. */
export async function createFollowUpSilence(input: {
	id: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	const [row] = await db
		.select({ districtId: districts.id })
		.from(followUps)
		.innerJoin(hardwareGrants, eq(hardwareGrants.id, followUps.grantId))
		.innerJoin(users, eq(users.id, hardwareGrants.recipientUserId))
		.innerJoin(learningCenters, eq(learningCenters.id, users.centerId))
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.innerJoin(districts, eq(districts.id, sectors.districtId))
		.where(eq(followUps.id, input.id))
		.limit(1);
	try {
		await authorize({
			permission: "district.manage",
			resource: { districtId: row?.districtId },
		});
	} catch (error) {
		if (!isApiError(error) || error.status !== 403) throw error;
		await authorize({ permission: "hardware.manage" });
	}
	return recordSilence(db, {
		followUpId: input.id,
		actorId: user.id,
		ip: clientIp(),
	});
}
