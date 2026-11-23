import { eq } from "drizzle-orm";
import type { Database } from "../../db";
import {
	contentVersions,
	enrollments,
	moduleProgress,
	taskProgress,
} from "../../db/schema";
import type { JsonValue } from "../../db/schema/compliance";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";

type ProgressDb = Pick<Database, "insert" | "select" | "update">;

export type TaskProgressStatus = "not_started" | "started" | "complete";

export type ModuleProgressStatus =
	| "locked"
	| "not_started"
	| "started"
	| "complete";

export type ProgressTask = {
	id: string;
	moduleId: string;
	position: number;
	required: boolean;
	titleEn: string;
	titleRw: string;
	status: TaskProgressStatus;
};

export type ProgressModule = {
	id: string;
	position: number;
	titleEn: string;
	titleRw: string;
	requires: string[];
	status: ModuleProgressStatus;
	requiredTotal: number;
	requiredComplete: number;
	tasks: ProgressTask[];
};

export type NextTask = {
	taskId: string;
	moduleId: string;
	titleEn: string;
	titleRw: string;
};

export type EnrollmentProgress = {
	enrollmentId: string;
	userId: number;
	courseId: string;
	centerId: string;
	contentVersionId: string;
	requiredTotal: number;
	requiredComplete: number;
	modules: ProgressModule[];
	next: NextTask | null;
};

type SnapshotModule = {
	id: string;
	position: number;
	titleEn: string;
	titleRw: string;
	requires: string[];
	tasks: SnapshotTask[];
};

type SnapshotTask = {
	id: string;
	position: number;
	required: boolean;
	titleEn: string;
	titleRw: string;
};

function asRecord(value: JsonValue): Record<string, JsonValue> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	return value;
}

function textOf(record: Record<string, JsonValue>, key: string): string {
	const value = record[key];
	return typeof value === "string" ? value : "";
}

function positionOf(record: Record<string, JsonValue>): number {
	const value = record.position;
	return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

function requiresOf(record: Record<string, JsonValue>): string[] {
	const value = record.requires;
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

function taskOf(value: JsonValue): SnapshotTask | null {
	const record = asRecord(value);
	if (!record || typeof record.id !== "string") return null;
	return {
		id: record.id,
		position: positionOf(record),
		required: record.required !== false,
		titleEn: textOf(record, "titleEn"),
		titleRw: textOf(record, "titleRw"),
	};
}

export function parseProgressSnapshot(snapshot: JsonValue): SnapshotModule[] {
	const record = asRecord(snapshot);
	if (!record || !Array.isArray(record.modules)) return [];
	const modules: SnapshotModule[] = [];
	for (const value of record.modules) {
		const moduleRecord = asRecord(value);
		if (!moduleRecord || typeof moduleRecord.id !== "string") continue;
		const tasks: SnapshotTask[] = [];
		if (Array.isArray(moduleRecord.tasks)) {
			for (const taskValue of moduleRecord.tasks) {
				const task = taskOf(taskValue);
				if (task) {
					tasks.push({
						id: task.id,
						position: task.position,
						required: task.required,
						titleEn: task.titleEn,
						titleRw: task.titleRw,
					});
				}
			}
		}
		tasks.sort((left, right) => left.position - right.position);
		modules.push({
			id: moduleRecord.id,
			position: positionOf(moduleRecord),
			titleEn: textOf(moduleRecord, "titleEn"),
			titleRw: textOf(moduleRecord, "titleRw"),
			requires: requiresOf(moduleRecord),
			tasks,
		});
	}
	modules.sort((left, right) => left.position - right.position);
	return modules;
}

function requiredTasks(module: SnapshotModule): SnapshotTask[] {
	return module.tasks.filter((task) => task.required);
}

export function moduleIsComplete(
	module: SnapshotModule,
	completed: ReadonlySet<string>,
): boolean {
	return requiredTasks(module).every((task) => completed.has(task.id));
}

export function moduleIsOpen(
	module: SnapshotModule,
	modules: readonly SnapshotModule[],
	completed: ReadonlySet<string>,
): boolean {
	return module.requires.every((requiredId) => {
		const earlier = modules.find((item) => item.id === requiredId);
		return earlier ? moduleIsComplete(earlier, completed) : false;
	});
}

/** The single required task a learner should do next, in the pinned version. */
export function deriveNextTask(
	modules: readonly SnapshotModule[],
	completed: ReadonlySet<string>,
): NextTask | null {
	for (const module of modules) {
		if (!moduleIsOpen(module, modules, completed)) continue;
		const next = requiredTasks(module).find((task) => !completed.has(task.id));
		if (!next) continue;
		return {
			taskId: next.id,
			moduleId: module.id,
			titleEn: next.titleEn,
			titleRw: next.titleRw,
		};
	}
	return null;
}

function taskStatus(
	taskId: string,
	rows: ReadonlyMap<string, TaskProgressStatus>,
): TaskProgressStatus {
	return rows.get(taskId) ?? "not_started";
}

function moduleStatus(
	module: SnapshotModule,
	modules: readonly SnapshotModule[],
	completed: ReadonlySet<string>,
	taskRows: ReadonlyMap<string, TaskProgressStatus>,
): ModuleProgressStatus {
	if (!moduleIsOpen(module, modules, completed)) return "locked";
	if (moduleIsComplete(module, completed)) return "complete";
	const touched = requiredTasks(module).some(
		(task) => taskStatus(task.id, taskRows) !== "not_started",
	);
	return touched ? "started" : "not_started";
}

function present(
	enrollment: {
		id: string;
		userId: number;
		courseId: string;
		centerId: string;
		contentVersionId: string;
	},
	modules: SnapshotModule[],
	taskRows: ReadonlyMap<string, TaskProgressStatus>,
): EnrollmentProgress {
	const completed = new Set(
		[...taskRows.entries()]
			.filter(([, status]) => status === "complete")
			.map(([taskId]) => taskId),
	);
	const presented = modules.map((module) => {
		const tasks = module.tasks.map((task) => ({
			...task,
			moduleId: module.id,
			status: taskStatus(task.id, taskRows),
		}));
		const required = tasks.filter((task) => task.required);
		return {
			id: module.id,
			position: module.position,
			titleEn: module.titleEn,
			titleRw: module.titleRw,
			requires: module.requires,
			status: moduleStatus(module, modules, completed, taskRows),
			requiredTotal: required.length,
			requiredComplete: required.filter((task) => task.status === "complete")
				.length,
			tasks,
		};
	});
	const requiredTasksFlat = presented.flatMap((module) =>
		module.tasks.filter((task) => task.required),
	);
	return {
		enrollmentId: enrollment.id,
		userId: enrollment.userId,
		courseId: enrollment.courseId,
		centerId: enrollment.centerId,
		contentVersionId: enrollment.contentVersionId,
		requiredTotal: requiredTasksFlat.length,
		requiredComplete: requiredTasksFlat.filter(
			(task) => task.status === "complete",
		).length,
		modules: presented,
		next: deriveNextTask(modules, completed),
	};
}

async function loadEnrollment(database: ProgressDb, enrollmentId: string) {
	const [enrollment] = await database
		.select({
			id: enrollments.id,
			userId: enrollments.userId,
			courseId: enrollments.courseId,
			centerId: enrollments.centerId,
			contentVersionId: enrollments.contentVersionId,
			snapshot: contentVersions.snapshot,
		})
		.from(enrollments)
		.innerJoin(
			contentVersions,
			eq(contentVersions.id, enrollments.contentVersionId),
		)
		.where(eq(enrollments.id, enrollmentId))
		.limit(1);
	if (!enrollment) throw errors.notFound("That enrollment was not found.");
	return {
		enrollment,
		modules: parseProgressSnapshot(enrollment.snapshot),
	};
}

async function taskStatuses(
	database: ProgressDb,
	enrollmentId: string,
): Promise<Map<string, TaskProgressStatus>> {
	const rows = await database
		.select({ taskId: taskProgress.taskId, status: taskProgress.status })
		.from(taskProgress)
		.where(eq(taskProgress.enrollmentId, enrollmentId));
	const statuses = new Map<string, TaskProgressStatus>();
	for (const row of rows) {
		if (row.status === "started" || row.status === "complete") {
			statuses.set(row.taskId, row.status);
		}
	}
	return statuses;
}

export async function readEnrollmentProgress(
	database: ProgressDb,
	enrollmentId: string,
): Promise<EnrollmentProgress> {
	const { enrollment, modules } = await loadEnrollment(database, enrollmentId);
	const statuses = await taskStatuses(database, enrollmentId);
	return present(enrollment, modules, statuses);
}

export async function listEnrollmentProgress(
	database: ProgressDb,
	userId: number,
): Promise<EnrollmentProgress[]> {
	const rows = await database
		.select({ id: enrollments.id })
		.from(enrollments)
		.where(eq(enrollments.userId, userId));
	const progress: EnrollmentProgress[] = [];
	for (const row of rows) {
		progress.push(await readEnrollmentProgress(database, row.id));
	}
	return progress;
}

function findTask(
	modules: readonly SnapshotModule[],
	taskId: string,
): { module: SnapshotModule; task: SnapshotTask } | null {
	for (const module of modules) {
		const task = module.tasks.find((item) => item.id === taskId);
		if (task) return { module, task };
	}
	return null;
}

async function syncModule(
	database: ProgressDb,
	enrollmentId: string,
	module: SnapshotModule,
	statuses: ReadonlyMap<string, TaskProgressStatus>,
): Promise<void> {
	const completed = new Set(
		[...statuses.entries()]
			.filter(([, status]) => status === "complete")
			.map(([taskId]) => taskId),
	);
	const status: "started" | "complete" = moduleIsComplete(module, completed)
		? "complete"
		: "started";
	const completedAt = status === "complete" ? new Date() : null;
	await database
		.insert(moduleProgress)
		.values({
			enrollmentId,
			moduleId: module.id,
			status,
			completedAt,
		})
		.onConflictDoUpdate({
			target: [moduleProgress.enrollmentId, moduleProgress.moduleId],
			set: { status, completedAt },
		});
}

export async function startTaskProgress(
	database: ProgressDb,
	input: {
		enrollmentId: string;
		taskId: string;
		actorId: number;
		ip: string;
	},
): Promise<EnrollmentProgress> {
	const { modules } = await loadEnrollment(database, input.enrollmentId);
	const found = findTask(modules, input.taskId);
	if (!found) throw errors.notFound("That task is not in this enrollment.");
	const statuses = await taskStatuses(database, input.enrollmentId);
	const completed = new Set(
		[...statuses.entries()]
			.filter(([, status]) => status === "complete")
			.map(([taskId]) => taskId),
	);
	if (!moduleIsOpen(found.module, modules, completed)) {
		throw errors.conflict("Finish the earlier module first.", {
			reason: "prerequisite",
		});
	}
	if (!statuses.has(input.taskId)) {
		await database.insert(taskProgress).values({
			enrollmentId: input.enrollmentId,
			taskId: input.taskId,
			status: "started",
		});
		statuses.set(input.taskId, "started");
		await syncModule(database, input.enrollmentId, found.module, statuses);
		await writeAudit(database, {
			actorId: input.actorId,
			action: "learning.task_started",
			targetType: "task",
			targetId: input.taskId,
			ipAddress: input.ip,
		});
	}
	return readEnrollmentProgress(database, input.enrollmentId);
}

/** Marks the pinned task complete. Phase 4 calls this when a review approves the evidence. */
export async function completeTaskProgress(
	database: ProgressDb,
	input: {
		enrollmentId: string;
		taskId: string;
		actorId: number;
		ip: string;
	},
): Promise<EnrollmentProgress> {
	const { modules } = await loadEnrollment(database, input.enrollmentId);
	const found = findTask(modules, input.taskId);
	if (!found) throw errors.notFound("That task is not in this enrollment.");
	const statuses = await taskStatuses(database, input.enrollmentId);
	const completed = new Set(
		[...statuses.entries()]
			.filter(([, status]) => status === "complete")
			.map(([taskId]) => taskId),
	);
	if (!moduleIsOpen(found.module, modules, completed)) {
		throw errors.conflict("Finish the earlier module first.", {
			reason: "prerequisite",
		});
	}
	if (statuses.get(input.taskId) !== "complete") {
		const now = new Date();
		await database
			.insert(taskProgress)
			.values({
				enrollmentId: input.enrollmentId,
				taskId: input.taskId,
				status: "complete",
				completedAt: now,
			})
			.onConflictDoUpdate({
				target: [taskProgress.enrollmentId, taskProgress.taskId],
				set: { status: "complete", completedAt: now },
			});
		statuses.set(input.taskId, "complete");
		await syncModule(database, input.enrollmentId, found.module, statuses);
		await writeAudit(database, {
			actorId: input.actorId,
			action: "learning.task_completed",
			targetType: "task",
			targetId: input.taskId,
			ipAddress: input.ip,
		});
	}
	return readEnrollmentProgress(database, input.enrollmentId);
}
