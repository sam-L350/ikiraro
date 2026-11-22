import { eq } from "drizzle-orm";
import type { Database } from "../../db";
import { accounts, privacyRequests, sessions, users } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit, writeEvent } from "../audit/write";

type PrivacyDb = Pick<
	Database,
	"delete" | "insert" | "select" | "transaction" | "update"
>;

export const TOMBSTONE_NAME = "Removed account";

export function tombstoneEmail(userId: number): string {
	return `removed-${userId}@removed.ikiraro.local`;
}

function isUniqueViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if ("code" in error && error.code === "23505") return true;
	if ("cause" in error) return isUniqueViolation(error.cause);
	return false;
}

/** Signs the person out and leaves the record in place. A later code can open it. */
export async function deactivateAccount(
	database: PrivacyDb,
	input: { userId: number; ip: string },
): Promise<{ deactivated: true }> {
	await database.transaction(async (tx) => {
		await tx
			.update(users)
			.set({ deactivatedAt: new Date() })
			.where(eq(users.id, input.userId));
		await tx.delete(sessions).where(eq(sessions.userId, input.userId));
		await writeAudit(tx, {
			actorId: input.userId,
			action: "account.deactivated",
			targetType: "user",
			targetId: String(input.userId),
			ipAddress: input.ip,
		});
	});
	return { deactivated: true };
}

/**
 * Queues anonymization and replaces the person's details with a tombstone.
 * The user id stays, and consents, the passport, reviews, and ledger rows
 * are not deleted.
 */
export async function requestDeletion(
	database: PrivacyDb,
	input: { userId: number; ip: string },
): Promise<{ id: string; status: "queued" }> {
	try {
		return await database.transaction(async (tx) => {
			const [request] = await tx
				.insert(privacyRequests)
				.values({
					userId: input.userId,
					kind: "deletion",
					status: "queued",
				})
				.returning({ id: privacyRequests.id });
			if (!request) throw new Error("Failed to queue the privacy request");

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
			await tx.delete(sessions).where(eq(sessions.userId, input.userId));
			await tx.delete(accounts).where(eq(accounts.userId, input.userId));
			await writeAudit(tx, {
				actorId: input.userId,
				action: "privacy.deletion_requested",
				targetType: "user",
				targetId: String(input.userId),
				ipAddress: input.ip,
				metadata: { requestId: request.id, status: "queued" },
			});
			await writeEvent(tx, {
				name: "privacy.anonymization_queued",
				payload: { userId: input.userId, requestId: request.id },
			});
			return { id: request.id, status: "queued" as const };
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw errors.conflict("A deletion request is already queued.", {
				reason: "deletion_pending",
			});
		}
		throw error;
	}
}
