import { requireAuth } from "../../../../../core/auth/require-auth";
import { clientIp } from "../../../../../core/http/client-ip";
import { finalizeMedia } from "../../../../../core/storage/media";
import { getObjectStore } from "../../../../../core/storage/object-store";
import { db } from "../../../../../db";

/** Store the content hash after the bytes match. A mismatch stores nothing. */
export async function createMediaFinalize(input: {
	id: string;
	sha256: string;
}): Promise<{
	id: string;
	sha256: string;
	byteSize: number;
	contentType: string;
}> {
	const user = await requireAuth();
	return finalizeMedia(db, getObjectStore(), {
		id: input.id,
		ownerUserId: user.id,
		sha256: input.sha256,
		ip: clientIp(),
	});
}
