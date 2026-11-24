import { eq } from "drizzle-orm";
import { requireAuth } from "../../../../../core/auth/require-auth";
import { authorize } from "../../../../../core/authz/authorize";
import { reviewFollowUpEvidence } from "../../../../../core/hardware/follow-ups";
import { clientIp } from "../../../../../core/http/client-ip";
import { db } from "../../../../../db";
import { followUps, hardwareGrants, users } from "../../../../../db/schema";

/** The center's trainer records the same kind of decision used on a task. */
export async function createFollowUpDecision(input: {
	id: string;
	evidenceId: string;
	decision: "approved" | "needs_revision" | "rejected";
	note: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	const [row] = await db
		.select({ centerId: users.centerId })
		.from(followUps)
		.innerJoin(hardwareGrants, eq(hardwareGrants.id, followUps.grantId))
		.innerJoin(users, eq(users.id, hardwareGrants.recipientUserId))
		.where(eq(followUps.id, input.id))
		.limit(1);
	await authorize({
		permission: "submission.review",
		resource: { centerId: row?.centerId ?? undefined },
	});
	return reviewFollowUpEvidence(db, {
		evidenceId: input.evidenceId,
		actorId: user.id,
		decision: input.decision,
		note: input.note,
		ip: clientIp(),
	});
}
