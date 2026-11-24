import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { createPathway } from "../../../../core/learning/pathways";
import { db } from "../../../../db";

/** Store an ordered pathway. Both languages are required. */
export async function createPathwayRecord(input: {
	titleEn: string;
	titleRw: string;
	courseIds: string[];
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "content.write" });
	return createPathway(db, { ...input, actorId: user.id, ip: clientIp() });
}
