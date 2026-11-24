import { eq } from "drizzle-orm";
import { isApiError } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { closeFollowUpReview } from "../../../../core/hardware/follow-ups";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";
import {
	districts,
	followUpReviews,
	followUps,
	hardwareGrants,
	learningCenters,
	sectors,
	users,
} from "../../../../db/schema";

/** Close an unanswered-check-in review. The note is the written reason. */
export async function createFollowUpClose(input: {
	reviewId: string;
	note: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	const [row] = await db
		.select({ districtId: districts.id })
		.from(followUpReviews)
		.innerJoin(followUps, eq(followUps.id, followUpReviews.followUpId))
		.innerJoin(hardwareGrants, eq(hardwareGrants.id, followUps.grantId))
		.innerJoin(users, eq(users.id, hardwareGrants.recipientUserId))
		.innerJoin(learningCenters, eq(learningCenters.id, users.centerId))
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.innerJoin(districts, eq(districts.id, sectors.districtId))
		.where(eq(followUpReviews.id, input.reviewId))
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
	return closeFollowUpReview(db, {
		reviewId: input.reviewId,
		actorId: user.id,
		note: input.note,
		ip: clientIp(),
	});
}
