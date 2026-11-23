import { eq } from "drizzle-orm";
import type { Database } from "../../db";
import {
	accounts,
	declaredRelationships,
	digitalPassports,
	mediaObjects,
	notifications,
	privacyRequests,
	sessions,
	taskSubmissions,
	users,
} from "../../db/schema";
import { writeAudit } from "../audit/write";
import { applyLearnerRls } from "../privacy/rls";
import { TOMBSTONE_NAME, tombstoneEmail } from "./privacy";

const REMOVED_TEXT = "Removed";

type AnonymizeDb = Pick<
	Database,
	"delete" | "insert" | "select" | "transaction" | "update"
>;

/**
 * Finishes queued deletion requests.
 * Notes, locations, file keys, and contact details go.
 * The user id, consent rows, verification rows, and ledger rows stay.
 */
/** Finish one queued removal. Other queued requests are left waiting. */
export async function anonymizeOne(
	database: AnonymizeDb,
	input: { requestId: string; userId: number; actorId: number; ip: string },
): Promise<void> {
	await database.transaction(async (tx) => {
		await applyLearnerRls(tx, { userId: input.userId, scope: "self" });
		await tx
			.update(users)
			.set({
				name: TOMBSTONE_NAME,
				email: tombstoneEmail(input.userId),
				phone: null,
				passwordHash: null,
				picture: null,
				dateOfBirth: null,
				gender: null,
				district: null,
				sector: null,
				village: null,
				economicSector: null,
				photoKey: null,
				guardianContact: null,
				deletedAt: new Date(),
			})
			.where(eq(users.id, input.userId));
		await tx
			.update(taskSubmissions)
			.set({
				note: null,
				deviceInfo: null,
				geoLat: null,
				geoLng: null,
				objectKey: null,
				contentHash: null,
			})
			.where(eq(taskSubmissions.ownerUserId, input.userId));
		const media = await tx
			.select({ id: mediaObjects.id })
			.from(mediaObjects)
			.where(eq(mediaObjects.ownerUserId, input.userId));
		for (const object of media) {
			await tx
				.update(mediaObjects)
				.set({ objectKey: `removed-${object.id}`, sha256: null })
				.where(eq(mediaObjects.id, object.id));
		}
		await tx
			.update(digitalPassports)
			.set({ publicShareToken: null })
			.where(eq(digitalPassports.userId, input.userId));
		await tx
			.update(declaredRelationships)
			.set({ contact: null })
			.where(eq(declaredRelationships.userId, input.userId));
		await tx
			.update(notifications)
			.set({ title: REMOVED_TEXT, body: REMOVED_TEXT, lastError: null })
			.where(eq(notifications.userId, input.userId));
		await tx.delete(sessions).where(eq(sessions.userId, input.userId));
		await tx.delete(accounts).where(eq(accounts.userId, input.userId));
		await tx
			.update(privacyRequests)
			.set({ status: "completed" })
			.where(eq(privacyRequests.id, input.requestId));
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "privacy.anonymized",
			targetType: "user",
			targetId: String(input.userId),
			ipAddress: input.ip,
			metadata: { requestId: input.requestId },
		});
	});
}

export async function anonymizeQueued(
	database: AnonymizeDb,
	input: { actorId: number; ip: string },
): Promise<{ completed: number }> {
	const waiting = await database
		.select({ id: privacyRequests.id, userId: privacyRequests.userId })
		.from(privacyRequests)
		.where(eq(privacyRequests.status, "queued"));

	for (const request of waiting) {
		await anonymizeOne(database, {
			requestId: request.id,
			userId: request.userId,
			actorId: input.actorId,
			ip: input.ip,
		});
	}
	return { completed: waiting.length };
}

export async function countQueuedRemovals(
	database: Pick<Database, "select">,
): Promise<number> {
	const rows = await database
		.select({ id: privacyRequests.id })
		.from(privacyRequests)
		.where(eq(privacyRequests.status, "queued"));
	return rows.length;
}
