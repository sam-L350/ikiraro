import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Database } from "../../db";
import {
	contentVersions,
	enrollments,
	learningCenters,
	mediaObjects,
	rubricCriteria,
	sectors,
	taskSubmissions,
	taskTranslations,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { ROLE_PERMISSIONS } from "../authz/catalog";
import { isEvidenceType } from "../content/author";
import {
	centerStaffByRole,
	expandCenterAssignments,
} from "../geography/centers";
import { readAssignments } from "../identity/staff";
import { EVIDENCE_URL_SECONDS } from "../storage/limits";
import type { ObjectStore } from "../storage/object-store";
import { type DuplicateKind, isDuplicateKind } from "./duplicates";
import { inPersonRequired } from "./in-person";
import {
	DEFAULT_REVIEW_SLA_MS,
	type EscalationStage,
	escalateOverdue,
	escalationStage,
	type ReviewUrgency,
	reviewDueAt,
	reviewUrgency,
} from "./sla";

export type { EscalationStage, ReviewUrgency };

export type EvidenceQueueItem = {
	id: string;
	attempt: number;
	status: "pending" | "in_review";
	evidenceType: "photo" | "file" | "note";
	submittedAt: string;
	reviewDueAt: string;
	urgency: ReviewUrgency;
	escalation: EscalationStage;
	learnerName: string;
	centerId: string;
	centerName: string;
	taskTitleRw: string;
	taskTitleEn: string;
	duplicate: DuplicateKind;
};

export type EvidenceQueue = {
	centers: { id: string; name: string }[];
	items: EvidenceQueueItem[];
};

export type EvidenceCriterion = {
	id: string;
	weight: number;
	passThreshold: number;
	promptRw: string;
	promptEn: string;
};

export type EvidenceReview = EvidenceQueueItem & {
	instructionsRw: string;
	instructionsEn: string;
	note: string | null;
	evidenceUrl: string | null;
	evidenceContentType: string | null;
	criteria: EvidenceCriterion[];
	requiresInPerson: boolean;
};

type ReviewDb = Pick<Database, "insert" | "select" | "update">;

export type ReviewCenter = {
	id: string;
	name: string;
	districtId: string;
};

function isWaitingStatus(value: string): value is EvidenceQueueItem["status"] {
	switch (value) {
		case "pending":
		case "in_review":
			return true;
		default:
			return false;
	}
}

/** Centers whose waiting evidence this person may open. */
export async function reviewCenters(
	database: ReviewDb,
	userId: number,
): Promise<ReviewCenter[]> {
	const assignments = expandCenterAssignments(
		await readAssignments(database, userId),
		await centerStaffByRole(database, userId),
	);
	const centerIds = new Set<string>();
	const districtIds = new Set<string>();
	let global = false;
	for (const assignment of assignments) {
		if (!ROLE_PERMISSIONS[assignment.role].includes("submission.review")) {
			continue;
		}
		switch (assignment.scopeType) {
			case "global":
				global = true;
				break;
			case "center":
				if (assignment.scopeId) centerIds.add(assignment.scopeId);
				break;
			case "district":
				if (assignment.scopeId) districtIds.add(assignment.scopeId);
				break;
			case "self":
				break;
			default: {
				const unreachable: never = assignment.scopeType;
				return unreachable;
			}
		}
	}
	const columns = {
		id: learningCenters.id,
		name: learningCenters.name,
		districtId: sectors.districtId,
	};
	const query = () =>
		database
			.select(columns)
			.from(learningCenters)
			.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId));
	if (global) return query().orderBy(asc(learningCenters.name));
	const found = new Map<string, ReviewCenter>();
	if (centerIds.size > 0) {
		const rows = await query().where(
			inArray(learningCenters.id, [...centerIds]),
		);
		for (const row of rows) found.set(row.id, row);
	}
	if (districtIds.size > 0) {
		const rows = await query().where(
			inArray(sectors.districtId, [...districtIds]),
		);
		for (const row of rows) found.set(row.id, row);
	}
	return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function allowedIds(
	centers: readonly ReviewCenter[],
	centerId?: string,
): string[] {
	if (!centerId) return centers.map((center) => center.id);
	if (!centers.some((center) => center.id === centerId)) {
		throw errors.notFound("That center was not found.");
	}
	return [centerId];
}

type QueueRow = {
	id: string;
	taskId: string;
	attempt: number;
	status: string;
	evidenceType: string;
	submittedAt: Date | null;
	reviewDueAt: Date | null;
	escalation: string;
	learnerName: string | null;
	centerId: string;
	centerName: string;
	note: string | null;
	mediaObjectId: string | null;
	duplicateKind: string;
	contentVersionId: string;
};

async function waitingRows(
	database: ReviewDb,
	centerIds: readonly string[],
	submissionId?: string,
): Promise<QueueRow[]> {
	if (centerIds.length === 0) return [];
	return database
		.select({
			id: taskSubmissions.id,
			taskId: taskSubmissions.taskId,
			attempt: taskSubmissions.attempt,
			status: taskSubmissions.status,
			evidenceType: taskSubmissions.evidenceType,
			submittedAt: taskSubmissions.submittedAt,
			reviewDueAt: taskSubmissions.reviewDueAt,
			escalation: taskSubmissions.escalation,
			learnerName: users.name,
			centerId: enrollments.centerId,
			centerName: learningCenters.name,
			note: taskSubmissions.note,
			mediaObjectId: taskSubmissions.mediaObjectId,
			duplicateKind: taskSubmissions.duplicateKind,
			contentVersionId: taskSubmissions.contentVersionId,
		})
		.from(taskSubmissions)
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.innerJoin(users, eq(users.id, taskSubmissions.ownerUserId))
		.innerJoin(learningCenters, eq(learningCenters.id, enrollments.centerId))
		.where(
			and(
				inArray(taskSubmissions.status, ["pending", "in_review"]),
				isNotNull(taskSubmissions.submittedAt),
				inArray(enrollments.centerId, [...centerIds]),
				submissionId ? eq(taskSubmissions.id, submissionId) : undefined,
			),
		)
		.orderBy(asc(taskSubmissions.submittedAt));
}

type TaskCopy = {
	titleRw: string;
	titleEn: string;
	instructionsRw: string;
	instructionsEn: string;
};

async function taskCopy(
	database: ReviewDb,
	taskIds: readonly string[],
): Promise<Map<string, TaskCopy>> {
	const copy = new Map<string, TaskCopy>();
	if (taskIds.length === 0) return copy;
	const rows = await database
		.select({
			taskId: taskTranslations.taskId,
			locale: taskTranslations.locale,
			title: taskTranslations.title,
			instructions: taskTranslations.instructions,
		})
		.from(taskTranslations)
		.where(inArray(taskTranslations.taskId, [...taskIds]));
	for (const row of rows) {
		const current = copy.get(row.taskId) ?? {
			titleRw: "",
			titleEn: "",
			instructionsRw: "",
			instructionsEn: "",
		};
		const instructions = row.instructions ?? "";
		switch (row.locale) {
			case "rw":
				current.titleRw = row.title;
				current.instructionsRw = instructions;
				break;
			case "en":
				current.titleEn = row.title;
				current.instructionsEn = instructions;
				break;
			default:
				break;
		}
		copy.set(row.taskId, current);
	}
	return copy;
}

function presentItem(
	row: QueueRow,
	copy: TaskCopy | undefined,
	now: Date,
): EvidenceQueueItem {
	if (
		!row.submittedAt ||
		!isWaitingStatus(row.status) ||
		!isEvidenceType(row.evidenceType) ||
		!isDuplicateKind(row.duplicateKind)
	) {
		throw errors.internal("That submission could not be read.");
	}
	return {
		id: row.id,
		attempt: row.attempt,
		status: row.status,
		evidenceType: row.evidenceType,
		submittedAt: row.submittedAt.toISOString(),
		reviewDueAt: (
			row.reviewDueAt ?? reviewDueAt(row.submittedAt, DEFAULT_REVIEW_SLA_MS)
		).toISOString(),
		urgency: reviewUrgency(
			row.reviewDueAt ?? reviewDueAt(row.submittedAt, DEFAULT_REVIEW_SLA_MS),
			now,
		),
		escalation: escalationStage(row.escalation),
		learnerName: row.learnerName?.trim() || "",
		centerId: row.centerId,
		centerName: row.centerName,
		taskTitleRw: copy?.titleRw ?? "",
		taskTitleEn: copy?.titleEn ?? "",
		duplicate: row.duplicateKind,
	};
}

/** Oldest waiting attempts at this person's centers. */
export async function listEvidenceQueue(
	database: ReviewDb,
	input: { reviewerId: number; centerId?: string; now?: Date },
): Promise<EvidenceQueue> {
	await escalateOverdue(database, input.now ?? new Date());
	const centers = await reviewCenters(database, input.reviewerId);
	const rows = await waitingRows(database, allowedIds(centers, input.centerId));
	const copy = await taskCopy(
		database,
		rows.map((row) => row.taskId),
	);
	const now = input.now ?? new Date();
	return {
		centers: centers.map((center) => ({ id: center.id, name: center.name })),
		items: rows.map((row) => presentItem(row, copy.get(row.taskId), now)),
	};
}

async function criteriaFor(
	database: ReviewDb,
	taskId: string,
): Promise<EvidenceCriterion[]> {
	const rows = await database
		.select({
			id: rubricCriteria.id,
			weight: rubricCriteria.weight,
			passThreshold: rubricCriteria.passThreshold,
			promptRw: rubricCriteria.promptRw,
			promptEn: rubricCriteria.promptEn,
		})
		.from(rubricCriteria)
		.where(eq(rubricCriteria.taskId, taskId))
		.orderBy(asc(rubricCriteria.position));
	return rows.map((row) => ({
		id: row.id,
		weight: row.weight,
		passThreshold: row.passThreshold,
		promptRw: row.promptRw ?? "",
		promptEn: row.promptEn ?? "",
	}));
}

/** Evidence beside the rubric. A center outside this person's scope is missing. */
export async function readEvidenceReview(
	database: ReviewDb,
	store: ObjectStore,
	input: { reviewerId: number; id: string; now?: Date },
): Promise<EvidenceReview> {
	const centers = await reviewCenters(database, input.reviewerId);
	const [row] = await waitingRows(
		database,
		centers.map((center) => center.id),
		input.id,
	);
	if (!row) throw errors.notFound("That submission was not found.");
	const copy = (await taskCopy(database, [row.taskId])).get(row.taskId);
	let evidenceUrl: string | null = null;
	let evidenceContentType: string | null = null;
	if (row.mediaObjectId) {
		const [media] = await database
			.select({
				objectKey: mediaObjects.objectKey,
				contentType: mediaObjects.contentType,
				status: mediaObjects.status,
			})
			.from(mediaObjects)
			.where(eq(mediaObjects.id, row.mediaObjectId))
			.limit(1);
		if (media?.status === "ready") {
			const signed = await store.createDownloadUrl({
				key: media.objectKey,
				expiresInSeconds: EVIDENCE_URL_SECONDS,
			});
			evidenceUrl = signed.url;
			evidenceContentType = media.contentType;
		}
	}
	const [version] = await database
		.select({ snapshot: contentVersions.snapshot })
		.from(contentVersions)
		.where(eq(contentVersions.id, row.contentVersionId))
		.limit(1);
	return {
		...presentItem(row, copy, input.now ?? new Date()),
		instructionsRw: copy?.instructionsRw ?? "",
		instructionsEn: copy?.instructionsEn ?? "",
		note: row.note,
		evidenceUrl,
		evidenceContentType,
		criteria: await criteriaFor(database, row.taskId),
		requiresInPerson: inPersonRequired(version?.snapshot),
	};
}

/** Opening the attempt stops the learner from taking it back. */
export async function startEvidenceReview(
	database: ReviewDb,
	input: { reviewerId: number; id: string; ip: string },
): Promise<{ id: string; status: "in_review" }> {
	const centers = await reviewCenters(database, input.reviewerId);
	const [row] = await database
		.select({
			id: taskSubmissions.id,
			status: taskSubmissions.status,
			centerId: enrollments.centerId,
		})
		.from(taskSubmissions)
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.where(eq(taskSubmissions.id, input.id))
		.limit(1);
	if (!row || !centers.some((center) => center.id === row.centerId)) {
		throw errors.notFound("That submission was not found.");
	}
	if (row.status === "in_review") return { id: row.id, status: "in_review" };
	if (row.status !== "pending") {
		throw errors.conflict("This attempt is no longer waiting.", {
			reason: "closed",
		});
	}
	const [updated] = await database
		.update(taskSubmissions)
		.set({ status: "in_review" })
		.where(
			and(
				eq(taskSubmissions.id, row.id),
				eq(taskSubmissions.status, "pending"),
			),
		)
		.returning({ id: taskSubmissions.id });
	if (!updated) return { id: row.id, status: "in_review" };
	await writeAudit(database, {
		actorId: input.reviewerId,
		action: "submission.review_started",
		targetType: "task_submission",
		targetId: row.id,
		ipAddress: input.ip,
	});
	return { id: row.id, status: "in_review" };
}
