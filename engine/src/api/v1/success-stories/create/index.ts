import { requireAuth } from "../../../../core/auth/require-auth";
import { clientIp } from "../../../../core/http/client-ip";
import { publishStory } from "../../../../core/impact/stories";
import { db } from "../../../../db";

/** Store a story and photo. Partners see it only while consent is on. */
export async function createSuccessStory(input: {
	body: string;
	mediaId: string;
}): Promise<{ id: string }> {
	const user = await requireAuth();
	return publishStory(db, {
		userId: user.id,
		body: input.body,
		mediaId: input.mediaId,
		ip: clientIp(),
	});
}
