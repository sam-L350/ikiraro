import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	type RetentionView,
	writeRetention,
} from "../../../../core/identity/retention";
import { db } from "../../../../db";

/** Store how many days a photo stays. Zero means the photo stays. */
export async function createRetentionPolicy(input: {
	days: number;
}): Promise<RetentionView> {
	const user = await requireAuth();
	return writeRetention(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		days: input.days,
		ip: clientIp(),
	});
}
