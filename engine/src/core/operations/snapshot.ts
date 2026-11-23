import {
	and,
	asc,
	count,
	eq,
	inArray,
	isNotNull,
	isNull,
	lt,
	sql,
} from "drizzle-orm";
import type { Database } from "../../db";
import {
	enrollments,
	learningCenters,
	mediaObjects,
	notifications,
	sectors,
	submissionVerifications,
	taskSubmissions,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { type PermissionCode, ROLE_PERMISSIONS } from "../authz/catalog";
import type { Assignment } from "../authz/decide";
import {
	centerStaffByRole,
	expandCenterAssignments,
} from "../geography/centers";
import { readAssignments } from "../identity/staff";
import { listEnrollmentProgress } from "../learning/progress";
import { reviewCenters } from "../learning/review-queue";
import { UPLOAD_URL_SECONDS } from "../storage/limits";
import { medianMinutes } from "./median";

type SnapshotDb = Pick<Database, "insert" | "select" | "update">;

export type NextStep = {
	enrollmentId: string;
	taskId: string;
	titleEn: string;
	titleRw: string;
	courseTitleEn: string;
	courseTitleRw: string;
};

export type CenterHealth = {
	id: string;
	name: string;
	activeLearners: number;
	waitingSubmissions: number;
	medianReviewMinutes: number | null;
};

export type SystemHealth = {
	outboxDepth: number;
	failedNotifications: number;
	storageErrors: number;
};

export type OperationsSnapshot = {
	includesNext: boolean;
	next: NextStep | null;
	queueDepth: number | null;
	centers: CenterHealth[] | null;
	system: SystemHealth | null;
};

function holds(
	assignments: readonly Assignment[],
	permission: PermissionCode,
): boolean {
	return assignments.some((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes(permission),
	);
}

function asCount(value: unknown): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

async function managedCenters(
	database: SnapshotDb,
	assignments: readonly Assignment[],
): Promise<{ id: string; name: string }[]> {
	const centerIds = new Set<string>();
	const districtIds = new Set<string>();
	let global = false;
	for (const assignment of assignments) {
		const manages =
			ROLE_PERMISSIONS[assignment.role].includes("center.manage") ||
			ROLE_PERMISSIONS[assignment.role].includes("district.manage");
		if (!manages) continue;
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
	const query = () =>
		database
			.select({ id: learningCenters.id, name: learningCenters.name })
			.from(learningCenters)
			.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId));
	if (global) return query().orderBy(asc(learningCenters.name));
	const found = new Map<string, { id: string; name: string }>();
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
	return [...found.values()].sort((left, right) =>
		left.name.localeCompare(right.name),
	);
}

async function groupedCount(
	database: SnapshotDb,
	centerIds: readonly string[],
	kind: "learners" | "waiting",
): Promise<Map<string, number>> {
	const totals = new Map<string, number>();
	if (centerIds.length === 0) return totals;
	switch (kind) {
		case "learners": {
			const rows = await database
				.select({
					centerId: enrollments.centerId,
					total: sql<number>`count(distinct ${enrollments.userId})`,
				})
				.from(enrollments)
				.innerJoin(users, eq(users.id, enrollments.userId))
				.where(
					and(
						inArray(enrollments.centerId, [...centerIds]),
						isNull(users.deactivatedAt),
						isNull(users.deletedAt),
					),
				)
				.groupBy(enrollments.centerId);
			for (const row of rows) totals.set(row.centerId, asCount(row.total));
			return totals;
		}
		case "waiting": {
			const rows = await database
				.select({
					centerId: enrollments.centerId,
					total: count(),
				})
				.from(taskSubmissions)
				.innerJoin(
					enrollments,
					eq(enrollments.id, taskSubmissions.enrollmentId),
				)
				.where(
					and(
						inArray(enrollments.centerId, [...centerIds]),
						inArray(taskSubmissions.status, ["pending", "in_review"]),
						isNotNull(taskSubmissions.submittedAt),
					),
				)
				.groupBy(enrollments.centerId);
			for (const row of rows) totals.set(row.centerId, asCount(row.total));
			return totals;
		}
		default: {
			const unreachable: never = kind;
			return unreachable;
		}
	}
}

async function reviewMinutes(
	database: SnapshotDb,
	centerIds: readonly string[],
): Promise<Map<string, number | null>> {
	const grouped = new Map<string, number[]>();
	if (centerIds.length === 0) return new Map();
	const rows = await database
		.select({
			centerId: enrollments.centerId,
			submittedAt: taskSubmissions.submittedAt,
			decidedAt: submissionVerifications.decidedAt,
		})
		.from(submissionVerifications)
		.innerJoin(
			taskSubmissions,
			eq(taskSubmissions.id, submissionVerifications.submissionId),
		)
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.where(
			and(
				inArray(enrollments.centerId, [...centerIds]),
				isNotNull(taskSubmissions.submittedAt),
			),
		);
	for (const row of rows) {
		if (!row.submittedAt) continue;
		const seconds =
			(row.decidedAt.getTime() - row.submittedAt.getTime()) / 1000;
		const list = grouped.get(row.centerId) ?? [];
		list.push(seconds);
		grouped.set(row.centerId, list);
	}
	const medians = new Map<string, number | null>();
	for (const [centerId, seconds] of grouped) {
		medians.set(centerId, medianMinutes(seconds));
	}
	return medians;
}

async function centerHealth(
	database: SnapshotDb,
	centers: readonly { id: string; name: string }[],
): Promise<CenterHealth[]> {
	const ids = centers.map((center) => center.id);
	const [learners, waiting, minutes] = await Promise.all([
		groupedCount(database, ids, "learners"),
		groupedCount(database, ids, "waiting"),
		reviewMinutes(database, ids),
	]);
	return centers.map((center) => ({
		id: center.id,
		name: center.name,
		activeLearners: learners.get(center.id) ?? 0,
		waitingSubmissions: waiting.get(center.id) ?? 0,
		medianReviewMinutes: minutes.get(center.id) ?? null,
	}));
}

async function queueDepth(
	database: SnapshotDb,
	userId: number,
): Promise<number> {
	const centers = await reviewCenters(database, userId);
	const ids = centers.map((center) => center.id);
	if (ids.length === 0) return 0;
	const [row] = await database
		.select({ total: count() })
		.from(taskSubmissions)
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.where(
			and(
				inArray(enrollments.centerId, ids),
				inArray(taskSubmissions.status, ["pending", "in_review"]),
				isNotNull(taskSubmissions.submittedAt),
			),
		);
	return asCount(row?.total);
}

async function systemHealth(database: SnapshotDb): Promise<SystemHealth> {
	const cutoff = new Date(Date.now() - UPLOAD_URL_SECONDS * 1000);
	const [queued, failed, storage] = await Promise.all([
		database
			.select({ total: count() })
			.from(notifications)
			.where(eq(notifications.status, "queued")),
		database
			.select({ total: count() })
			.from(notifications)
			.where(eq(notifications.status, "failed")),
		database
			.select({ total: count() })
			.from(mediaObjects)
			.where(
				and(
					eq(mediaObjects.status, "pending"),
					lt(mediaObjects.createdAt, cutoff),
				),
			),
	]);
	return {
		outboxDepth: asCount(queued[0]?.total),
		failedNotifications: asCount(failed[0]?.total),
		storageErrors: asCount(storage[0]?.total),
	};
}

async function nextStep(
	database: SnapshotDb,
	userId: number,
): Promise<NextStep | null> {
	const progress = await listEnrollmentProgress(database, userId);
	const open = progress.filter((enrollment) => enrollment.next);
	open.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
	const focus = open[0];
	if (!focus?.next) return null;
	return {
		enrollmentId: focus.enrollmentId,
		taskId: focus.next.taskId,
		titleEn: focus.next.titleEn,
		titleRw: focus.next.titleRw,
		courseTitleEn: focus.courseTitleEn,
		courseTitleRw: focus.courseTitleRw,
	};
}

/**
 * The numbers this person is allowed to see.
 * A trainer sees waiting evidence. A manager sees the center. An admin sees the outbox.
 */
export async function loadOperations(
	database: SnapshotDb,
	userId: number,
): Promise<OperationsSnapshot> {
	const assignments = expandCenterAssignments(
		await readAssignments(database, userId),
		await centerStaffByRole(database, userId),
	);
	const includesNext = holds(assignments, "learning.progress");
	const includesQueue = holds(assignments, "submission.review");
	const includesCenters =
		holds(assignments, "center.manage") ||
		holds(assignments, "district.manage");
	const includesSystem = holds(assignments, "admin.manage");
	if (!includesNext && !includesQueue && !includesCenters && !includesSystem) {
		throw errors.forbidden("Nothing is waiting for you here.");
	}
	const [next, depth, centers, system] = await Promise.all([
		includesNext ? nextStep(database, userId) : Promise.resolve(null),
		includesQueue ? queueDepth(database, userId) : Promise.resolve(null),
		includesCenters
			? centerHealth(database, await managedCenters(database, assignments))
			: Promise.resolve(null),
		includesSystem ? systemHealth(database) : Promise.resolve(null),
	]);
	return {
		includesNext,
		next,
		queueDepth: depth,
		centers,
		system,
	};
}
