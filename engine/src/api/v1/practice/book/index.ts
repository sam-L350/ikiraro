import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	bookPracticeSlot,
	type PracticeBooking,
} from "../../../../core/geography/devices";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Reserve a practice slot. The booking id is the client's, so a retry is the same row. */
export async function createPracticeBooking(input: {
	deviceId: string;
	bookingId: string;
	startsAt: string;
	minutes: number;
}): Promise<PracticeBooking> {
	const user = await requireAuth();
	await authorize({
		permission: "learning.progress",
		resource: { ownerId: String(user.id) },
	});
	return bookPracticeSlot(db, {
		learnerId: user.id,
		deviceId: input.deviceId,
		bookingId: input.bookingId,
		startsAt: input.startsAt,
		minutes: input.minutes,
		ip: clientIp(),
	});
}
