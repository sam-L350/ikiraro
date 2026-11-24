import { and, asc, desc, eq, isNotNull, lt } from "drizzle-orm";
import type { Database } from "../../db";
import {
	mediaObjects,
	retentionPolicies,
	taskSubmissions,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { ROLE_PERMISSIONS } from "../authz/catalog";
import type { Assignment } from "../authz/decide";
import { logger } from "../logger";
import type { ObjectStore } from "../storage/object-store";

type RetentionDb = Pick<Database, "insert" | "select" | "update">;

const DAY_MS = 24 * 60 * 60 * 1000;
const DROP_LIMIT = 20;

export type RetentionView = { days: number | null };

function requireAdmin(assignments: readonly Assignment[]): void {
	const allowed = assignments.some((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes("admin.manage"),
	);
	if (!allowed) {
		throw errors.forbidden("An administrator stores how long a photo stays.", {
			reason: "retention",
		});
	}
}

function requireDays(value: number): number {
	if (!Number.isInteger(value) || value < 0 || value > 3650) {
		throw errors.badRequest("Write how many days.", { reason: "days" });
	}
	return value;
}

/** The newest period. No row means nothing is stored, and zero means photos stay. */
export async function readRetention(
	database: Pick<Database, "select">,
	input: { assignments: readonly Assignment[] },
): Promise<RetentionView> {
	requireAdmin(input.assignments);
	const [row] = await database
		.select({ days: retentionPolicies.evidenceDays })
		.from(retentionPolicies)
		.orderBy(desc(retentionPolicies.createdAt))
		.limit(1);
	return { days: row ? row.days : null };
}

/** Store the next period. Zero is a typed choice that photos stay. */
export async function writeRetention(
	database: RetentionDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		days: number;
		ip: string;
	},
): Promise<RetentionView> {
	requireAdmin(input.assignments);
	const days = requireDays(input.days);
	const [created] = await database
		.insert(retentionPolicies)
		.values({ evidenceDays: days, createdByUserId: input.actorId })
		.returning({ days: retentionPolicies.evidenceDays });
	await writeAudit(database, {
		actorId: input.actorId,
		action: "retention.stored",
		targetType: "retention_policy",
		targetId: String(days),
		ipAddress: input.ip,
	});
	return { days: created?.days ?? days };
}

/**
 * Remove photo bytes older than the stored period.
 * The submission and its decision stay. Zero days, or no period, removes nothing.
 */
export async function dropExpiredImages(
	database: RetentionDb,
	store: ObjectStore,
	at: Date = new Date(),
): Promise<{ dropped: number }> {
	const [policy] = await database
		.select({ days: retentionPolicies.evidenceDays })
		.from(retentionPolicies)
		.orderBy(desc(retentionPolicies.createdAt))
		.limit(1);
	if (!policy || policy.days === 0) return { dropped: 0 };
	const cutoff = new Date(at.getTime() - policy.days * DAY_MS);
	const rows = await database
		.select({
			id: taskSubmissions.id,
			objectKey: taskSubmissions.objectKey,
			mediaId: taskSubmissions.mediaObjectId,
		})
		.from(taskSubmissions)
		.where(
			and(
				eq(taskSubmissions.evidenceType, "photo"),
				isNotNull(taskSubmissions.objectKey),
				lt(taskSubmissions.createdAt, cutoff),
			),
		)
		.orderBy(asc(taskSubmissions.createdAt))
		.limit(DROP_LIMIT);
	let dropped = 0;
	for (const row of rows) {
		if (row.objectKey) {
			try {
				await store.remove(row.objectKey);
			} catch (error) {
				logger.error("evidence image was not removed", { error });
				continue;
			}
		}
		if (row.mediaId) {
			await database
				.update(mediaObjects)
				.set({
					objectKey: `dropped-${row.mediaId}`,
					sha256: null,
				})
				.where(eq(mediaObjects.id, row.mediaId));
		}
		await database
			.update(taskSubmissions)
			.set({ objectKey: null, contentHash: null })
			.where(eq(taskSubmissions.id, row.id));
		dropped += 1;
	}
	return { dropped };
}
