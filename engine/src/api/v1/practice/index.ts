import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	type CenterDevice,
	listPractice,
	type PracticeBooking,
} from "../../../core/geography/devices";
import { db } from "../../../db";

/** Machines a learner can book, and the slots they already hold. */
export async function getPractice(): Promise<{
	items: CenterDevice[];
	bookings: PracticeBooking[];
}> {
	const user = await requireAuth();
	await authorize({
		permission: "learning.progress",
		resource: { ownerId: String(user.id) },
	});
	return listPractice(db, { learnerId: user.id });
}
