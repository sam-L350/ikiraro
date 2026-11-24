import { ApiError } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import { createUploadIntent } from "../../../../core/storage/media";
import { getObjectStore } from "../../../../core/storage/object-store";
import { db } from "../../../../db";

/** Ask for a short-lived upload URL. The file is not evidence until it is finalized. */
export async function createMediaUploadIntent(input: {
	contentType: string;
	byteSize: number;
}): Promise<{
	id: string;
	uploadUrl: string;
	contentType: string;
	expiresAt: string;
	maxBytes: number;
	compressTargetBytes: number;
}> {
	const user = await requireAuth();
	let allowed = false;
	try {
		await authorize({ permission: "learning.progress" });
		allowed = true;
	} catch (error) {
		if (!(error instanceof ApiError) || error.status !== 403) throw error;
	}
	if (!allowed) {
		try {
			await authorize({ permission: "content.write" });
			allowed = true;
		} catch (error) {
			if (!(error instanceof ApiError) || error.status !== 403) throw error;
		}
	}
	if (!allowed) await authorize({ permission: "hardware.manage" });
	return createUploadIntent(db, getObjectStore(), {
		ownerUserId: user.id,
		contentType: input.contentType,
		byteSize: input.byteSize,
		ip: clientIp(),
	});
}
