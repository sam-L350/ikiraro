import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { publishHelpGuide } from "../../../../core/support/guides";
import { db } from "../../../../db";

/** Publish a guide. Audio or video is optional. */
export async function createHelpGuide(input: {
	titleEn: string;
	titleRw: string;
	bodyEn: string;
	bodyRw: string;
	walkthrough?: string;
	mediaId?: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return publishHelpGuide(db, {
		actorId: user.id,
		titleEn: input.titleEn,
		titleRw: input.titleRw,
		bodyEn: input.bodyEn,
		bodyRw: input.bodyRw,
		walkthrough: input.walkthrough,
		mediaId: input.mediaId,
		ip: clientIp(),
	});
}
