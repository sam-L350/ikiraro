import { requireAuth } from "../../../../core/auth/require-auth";
import {
	type ContentPackFile,
	downloadContentPack,
} from "../../../../core/content/packs";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** One published course for one center. The file has no learner. */
export async function getContentPackDownload(input: {
	centerId: string;
	courseId: string;
}): Promise<ContentPackFile> {
	const user = await requireAuth();
	return downloadContentPack(db, {
		userId: user.id,
		centerId: input.centerId,
		courseId: input.courseId,
		ip: clientIp(),
	});
}
