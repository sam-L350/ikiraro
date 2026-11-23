import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db";
import {
	mediaObjects,
	submissionVerifications,
	taskSubmissions,
	verificationRevocations,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit, writeEvent } from "../audit/write";
import { isEvidenceType } from "../content/author";
import { readEnrollmentProgress, startTaskProgress } from "./progress";
import { feedbackForSubmissions } from "./verifications";

export const SUBMISSION_STATUSES = [
	"draft",
	"pending",
	"in_review",
	"approved",
	"needs_revision",
	"rejected",
	"escalated",
	"withdrawn",
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

const NOTE_LIMIT = 2_000;
const DEVICE_LIMIT = 80;

export type SubmissionView = {
	id: string;
	enrollmentId: string;
	taskId: string;
	attempt: number;
	status: SubmissionStatus;
	evidenceType: "photo" | "file" | "note";
	submittedAt: string | null;
	/** The learner's own words, when the attempt is a note or a draft. */
	note: string | null;
	/** The note from the recorded decision, when one exists. */
	feedback: string | null;
	/** True when an approval was reversed and no longer stands. */
	revoked: boolean;
};

type SubmissionDb = Pick<
	Database,
	"insert" | "select" | "update" | "transaction"
>;

type StoredRow = {
	id: string;
	enrollmentId: string;
	taskId: string;
	ownerUserId: number;
	attempt: number;
	status: string;
	evidenceType: string;
	note: string | null;
	submittedAt: Date | null;
};

export function isSubmissionStatus(value: string): value is SubmissionStatus {
	switch (value) {
		case "draft":
		case "pending":
		case "in_review":
		case "approved":
		case "needs_revision":
		case "rejected":
		case "escalated":
		case "withdrawn":
			return true;
		default:
			return false;
	}
}

/**
 * An open attempt blocks another. A pass, a rejection, or an escalation stays
 * closed. After a send-back the learner may try three more times.
 */
export function createBlock(
	statuses: readonly SubmissionStatus[],
): "ok" | "open" | "closed" | "limit" {
	let closed = false;
	let revisions = 0;
	for (const status of statuses) {
		switch (status) {
			case "draft":
			case "pending":
			case "in_review":
				return "open";
			case "needs_revision":
				revisions += 1;
				break;
			case "approved":
			case "rejected":
			case "escalated":
				closed = true;
				break;
			case "withdrawn":
				break;
			default: {
				const unreachable: never = status;
				return unreachable;
			}
		}
	}
	if (closed) return "closed";
	if (revisions >= 4) return "limit";
	return "ok";
}

/** Withdrawal is only allowed before a trainer starts the review. */
export function canWithdraw(status: SubmissionStatus): boolean {
	switch (status) {
		case "draft":
		case "pending":
			return true;
		case "in_review":
		case "approved":
		case "needs_revision":
		case "rejected":
		case "escalated":
		case "withdrawn":
			return false;
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

export function nextAttempt(attempts: readonly number[]): number {
	let highest = 0;
	for (const attempt of attempts) {
		if (attempt > highest) highest = attempt;
	}
	return highest + 1;
}

function present(
	row: StoredRow,
	feedback: string | null = null,
	revoked = false,
): SubmissionView {
	if (!isSubmissionStatus(row.status) || !isEvidenceType(row.evidenceType)) {
		throw errors.internal("That submission could not be read.");
	}
	const status = row.status;
	const evidenceType = row.evidenceType;
	return {
		id: row.id,
		enrollmentId: row.enrollmentId,
		taskId: row.taskId,
		attempt: row.attempt,
		status,
		evidenceType,
		submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
		note: row.note,
		feedback,
		revoked,
	};
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	);
}

function cleanDevice(value: string | undefined): string | null {
	const trimmed = value?.trim() ?? "";
	if (!trimmed) return null;
	if (trimmed.length > DEVICE_LIMIT) {
		throw errors.badRequest("That device description is too long.", {
			reason: "device",
		});
	}
	return trimmed;
}

function cleanNote(value: string | undefined): string | null {
	const trimmed = value?.trim() ?? "";
	if (!trimmed) return null;
	if (trimmed.length > NOTE_LIMIT) {
		throw errors.badRequest("That note is too long.", { reason: "note" });
	}
	return trimmed;
}

function cleanGeo(
	lat: number | undefined,
	lng: number | undefined,
): { geoLat: number; geoLng: number } | { geoLat: null; geoLng: null } {
	if (lat === undefined && lng === undefined) {
		return { geoLat: null, geoLng: null };
	}
	if (
		typeof lat !== "number" ||
		typeof lng !== "number" ||
		!Number.isFinite(lat) ||
		!Number.isFinite(lng) ||
		lat < -90 ||
		lat > 90 ||
		lng < -180 ||
		lng > 180
	) {
		throw errors.badRequest("That location is not usable.", { reason: "geo" });
	}
	return { geoLat: lat, geoLng: lng };
}

function isUniqueViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if ("code" in error && error.code === "23505") return true;
	if ("cause" in error) return isUniqueViolation(error.cause);
	return false;
}

const rowColumns = {
	id: taskSubmissions.id,
	enrollmentId: taskSubmissions.enrollmentId,
	taskId: taskSubmissions.taskId,
	ownerUserId: taskSubmissions.ownerUserId,
	attempt: taskSubmissions.attempt,
	status: taskSubmissions.status,
	evidenceType: taskSubmissions.evidenceType,
	note: taskSubmissions.note,
	submittedAt: taskSubmissions.submittedAt,
};

/** Store one attempt. The same client id returns the attempt already stored. */
export async function createSubmission(
	database: SubmissionDb,
	input: {
		id: string;
		enrollmentId: string;
		taskId: string;
		ownerUserId: number;
		mediaId?: string;
		note?: string;
		deviceInfo?: string;
		geoLat?: number;
		geoLng?: number;
		submit: boolean;
		ip: string;
	},
): Promise<SubmissionView> {
	if (!isUuid(input.id)) {
		throw errors.badRequest("That submission id is not usable.", {
			reason: "id",
		});
	}
	const progress = await readEnrollmentProgress(database, input.enrollmentId);
	if (progress.userId !== input.ownerUserId) {
		throw errors.notFound("That enrollment was not found.");
	}
	const started = await startTaskProgress(database, {
		enrollmentId: input.enrollmentId,
		taskId: input.taskId,
		actorId: input.ownerUserId,
		ip: input.ip,
	});
	const module = started.modules.find((item) =>
		item.tasks.some((task) => task.id === input.taskId),
	);
	const task = module?.tasks.find((item) => item.id === input.taskId);
	const evidenceType = task?.evidenceType;
	if (!module || !task || !evidenceType || !isEvidenceType(evidenceType)) {
		throw errors.notFound("That task is not in this enrollment.");
	}
	if (task.status === "complete") {
		throw errors.conflict("This task is already complete.", {
			reason: "closed",
		});
	}
	const note = cleanNote(input.note);
	const deviceInfo = cleanDevice(input.deviceInfo);
	const geo = cleanGeo(input.geoLat, input.geoLng);
	const evidence = await evidenceFor(database, {
		evidenceType,
		ownerUserId: input.ownerUserId,
		mediaId: input.mediaId,
		note,
	});
	const status: SubmissionStatus = input.submit ? "pending" : "draft";
	try {
		return await database.transaction(async (tx) => {
			const [existing] = await tx
				.select(rowColumns)
				.from(taskSubmissions)
				.where(eq(taskSubmissions.id, input.id))
				.limit(1);
			if (existing) {
				if (
					existing.ownerUserId !== input.ownerUserId ||
					existing.enrollmentId !== input.enrollmentId ||
					existing.taskId !== input.taskId
				) {
					throw errors.conflict("That submission id is already used.", {
						reason: "id",
					});
				}
				return present(existing);
			}
			const earlier = await tx
				.select({
					attempt: taskSubmissions.attempt,
					status: taskSubmissions.status,
					revoked: verificationRevocations.id,
				})
				.from(taskSubmissions)
				.leftJoin(
					submissionVerifications,
					eq(submissionVerifications.submissionId, taskSubmissions.id),
				)
				.leftJoin(
					verificationRevocations,
					eq(
						verificationRevocations.verificationId,
						submissionVerifications.id,
					),
				)
				.where(
					and(
						eq(taskSubmissions.enrollmentId, input.enrollmentId),
						eq(taskSubmissions.taskId, input.taskId),
					),
				);
			const statuses = earlier.flatMap((row) => {
				if (!isSubmissionStatus(row.status)) return [];
				if (row.status === "approved" && row.revoked !== null) return [];
				return [row.status];
			});
			const block = createBlock(statuses);
			switch (block) {
				case "ok":
					break;
				case "open":
					throw errors.conflict("This task already has something waiting.", {
						reason: "open",
					});
				case "closed":
					throw errors.conflict("This task is waiting on a trainer.", {
						reason: "closed",
					});
				case "limit":
					throw errors.conflict("Meet a trainer before another attempt.", {
						reason: "limit",
					});
				default: {
					const unreachable: never = block;
					throw unreachable;
				}
			}
			const submittedAt = status === "pending" ? new Date() : null;
			const [created] = await tx
				.insert(taskSubmissions)
				.values({
					id: input.id,
					enrollmentId: input.enrollmentId,
					taskId: input.taskId,
					contentVersionId: progress.contentVersionId,
					ownerUserId: input.ownerUserId,
					attempt: nextAttempt(earlier.map((row) => row.attempt)),
					status,
					evidenceType,
					mediaObjectId: evidence.mediaObjectId,
					objectKey: evidence.objectKey,
					contentHash: evidence.contentHash,
					note: evidence.note,
					deviceInfo,
					geoLat: geo.geoLat,
					geoLng: geo.geoLng,
					submittedAt,
				})
				.returning(rowColumns);
			if (!created) throw errors.internal("The submission was not stored.");
			await writeAudit(tx, {
				actorId: input.ownerUserId,
				action: "submission.created",
				targetType: "task_submission",
				targetId: created.id,
				ipAddress: input.ip,
				metadata: {
					status,
					attempt: created.attempt,
					evidenceType,
				},
			});
			await writeEvent(tx, {
				name: "submission.created",
				payload: {
					submissionId: created.id,
					enrollmentId: input.enrollmentId,
					taskId: input.taskId,
					attempt: created.attempt,
					status,
				},
			});
			return present(created);
		});
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		throw errors.conflict("This task already has something waiting.", {
			reason: "open",
		});
	}
}

async function evidenceFor(
	database: SubmissionDb,
	input: {
		evidenceType: "photo" | "file" | "note";
		ownerUserId: number;
		mediaId?: string;
		note: string | null;
	},
): Promise<{
	mediaObjectId: string | null;
	objectKey: string | null;
	contentHash: string | null;
	note: string | null;
}> {
	switch (input.evidenceType) {
		case "note":
			if (!input.note) {
				throw errors.badRequest("Write the note first.", { reason: "note" });
			}
			return {
				mediaObjectId: null,
				objectKey: null,
				contentHash: null,
				note: input.note,
			};
		case "photo":
		case "file":
			return readMedia(
				database,
				input.evidenceType,
				input.ownerUserId,
				input.mediaId,
			);
		default: {
			const unreachable: never = input.evidenceType;
			return unreachable;
		}
	}
}

async function readMedia(
	database: SubmissionDb,
	evidenceType: "photo" | "file",
	ownerUserId: number,
	mediaId: string | undefined,
): Promise<{
	mediaObjectId: string | null;
	objectKey: string | null;
	contentHash: string | null;
	note: string | null;
}> {
	if (!mediaId || !isUuid(mediaId)) {
		throw errors.badRequest("That file is not ready.", { reason: "media" });
	}
	const [media] = await database
		.select({
			id: mediaObjects.id,
			ownerUserId: mediaObjects.ownerUserId,
			objectKey: mediaObjects.objectKey,
			contentType: mediaObjects.contentType,
			sha256: mediaObjects.sha256,
			status: mediaObjects.status,
		})
		.from(mediaObjects)
		.where(eq(mediaObjects.id, mediaId))
		.limit(1);
	if (!media || media.ownerUserId !== ownerUserId) {
		throw errors.notFound("That file was not found.");
	}
	if (media.status !== "ready" || !media.sha256) {
		throw errors.conflict("That file is not ready.", { reason: "media" });
	}
	const allowed =
		evidenceType === "photo"
			? media.contentType === "image/jpeg" ||
				media.contentType === "image/png" ||
				media.contentType === "image/webp"
			: media.contentType === "application/pdf";
	if (!allowed) {
		throw errors.badRequest("That file type does not match this task.", {
			reason: "type",
		});
	}
	return {
		mediaObjectId: media.id,
		objectKey: media.objectKey,
		contentHash: media.sha256,
		note: null,
	};
}

/**
 * Change a draft the learner still owns. A review, a rejection, or an
 * approval is left as the server stored it.
 */
export async function saveDraftSubmission(
	database: SubmissionDb,
	input: {
		id: string;
		ownerUserId: number;
		note?: string;
		submit: boolean;
		ip: string;
	},
): Promise<SubmissionView> {
	if (!isUuid(input.id)) {
		throw errors.badRequest("That submission id is not usable.", {
			reason: "id",
		});
	}
	const note = input.note === undefined ? undefined : cleanNote(input.note);
	const [row] = await database
		.select(rowColumns)
		.from(taskSubmissions)
		.where(eq(taskSubmissions.id, input.id))
		.limit(1);
	if (!row || row.ownerUserId !== input.ownerUserId) {
		throw errors.notFound("That submission was not found.");
	}
	if (!isSubmissionStatus(row.status) || row.status !== "draft") {
		throw errors.conflict("The server already decided this attempt.", {
			reason: "closed",
		});
	}
	const nextNote = note === undefined ? row.note : note;
	const submittedAt = input.submit ? new Date() : row.submittedAt;
	await database
		.update(taskSubmissions)
		.set({
			note: nextNote,
			status: input.submit ? "pending" : "draft",
			submittedAt,
		})
		.where(eq(taskSubmissions.id, row.id));
	if (input.submit) {
		await writeAudit(database, {
			actorId: input.ownerUserId,
			action: "submission.created",
			targetType: "task_submission",
			targetId: row.id,
			ipAddress: input.ip,
			metadata: { status: "pending", attempt: row.attempt },
		});
		await writeEvent(database, {
			name: "submission.created",
			payload: {
				submissionId: row.id,
				enrollmentId: row.enrollmentId,
				taskId: row.taskId,
				attempt: row.attempt,
				status: "pending",
			},
		});
	}
	return present({
		...row,
		note: nextNote,
		status: input.submit ? "pending" : "draft",
		submittedAt,
	});
}

/** The learner's attempts on this enrollment, newest first. */
export async function listSubmissions(
	database: SubmissionDb,
	input: { enrollmentId: string; ownerUserId: number },
): Promise<SubmissionView[]> {
	const progress = await readEnrollmentProgress(database, input.enrollmentId);
	if (progress.userId !== input.ownerUserId) {
		throw errors.notFound("That enrollment was not found.");
	}
	const rows = await database
		.select(rowColumns)
		.from(taskSubmissions)
		.where(
			and(
				eq(taskSubmissions.enrollmentId, input.enrollmentId),
				eq(taskSubmissions.ownerUserId, input.ownerUserId),
			),
		)
		.orderBy(desc(taskSubmissions.createdAt));
	const notes = await feedbackForSubmissions(
		database,
		rows.map((row) => row.id),
	);
	const revokedRows =
		rows.length === 0
			? []
			: await database
					.select({
						submissionId: submissionVerifications.submissionId,
					})
					.from(verificationRevocations)
					.innerJoin(
						submissionVerifications,
						eq(
							submissionVerifications.id,
							verificationRevocations.verificationId,
						),
					)
					.where(
						inArray(
							submissionVerifications.submissionId,
							rows.map((row) => row.id),
						),
					);
	const revokedIds = new Set(revokedRows.map((row) => row.submissionId));
	return rows.map((row) =>
		present(row, notes.get(row.id) ?? null, revokedIds.has(row.id)),
	);
}

/** Take an attempt back. A review that has started cannot be withdrawn. */
export async function withdrawSubmission(
	database: SubmissionDb,
	input: { id: string; ownerUserId: number; ip: string },
): Promise<SubmissionView> {
	if (!isUuid(input.id)) {
		throw errors.badRequest("That submission id is not usable.", {
			reason: "id",
		});
	}
	const [row] = await database
		.select(rowColumns)
		.from(taskSubmissions)
		.where(eq(taskSubmissions.id, input.id))
		.limit(1);
	if (!row || row.ownerUserId !== input.ownerUserId) {
		throw errors.notFound("That submission was not found.");
	}
	if (!isSubmissionStatus(row.status)) {
		throw errors.conflict("That submission cannot be taken back.", {
			reason: "review_started",
		});
	}
	if (row.status === "withdrawn") return present(row);
	if (!canWithdraw(row.status)) {
		throw errors.conflict("A trainer has already started this review.", {
			reason: "review_started",
		});
	}
	const withdrawnAt = new Date();
	const [updated] = await database
		.update(taskSubmissions)
		.set({ status: "withdrawn", withdrawnAt })
		.where(eq(taskSubmissions.id, row.id))
		.returning(rowColumns);
	if (!updated) throw errors.internal("The submission was not updated.");
	await writeAudit(database, {
		actorId: input.ownerUserId,
		action: "submission.withdrawn",
		targetType: "task_submission",
		targetId: row.id,
		ipAddress: input.ip,
	});
	return present(updated);
}
