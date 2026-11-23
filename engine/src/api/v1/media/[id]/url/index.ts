import { requireAuth } from "../../../../../core/auth/require-auth";
import { createEvidenceUrl } from "../../../../../core/storage/media";
import { getObjectStore } from "../../../../../core/storage/object-store";
import { db } from "../../../../../db";

/** A private read link for the owner. It expires in minutes. */
export async function createMediaEvidenceUrl(input: {
	id: string;
}): Promise<{ url: string; expiresAt: string }> {
	const user = await requireAuth();
	return createEvidenceUrl(db, getObjectStore(), {
		id: input.id,
		ownerUserId: user.id,
	});
}
