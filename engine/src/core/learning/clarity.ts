import { and, eq } from "drizzle-orm";
import type { Database } from "../../db";
import {
	contentVersions,
	courses,
	enrollments,
	taskClarity,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { parseProgressSnapshot } from "./progress";

type ClarityDb = Pick<Database, "insert" | "select" | "update">;

export type ClarityRating = "clear" | "hard";

export type TaskClarity = {
	taskId: string;
	rating: ClarityRating;
};

export type ClarityCount = {
	taskId: string;
	clear: number;
	hard: number;
};

export function clarityRating(value: string): ClarityRating | null {
	switch (value) {
		case "clear":
		case "hard":
			return value;
		default:
			return null;
	}
}

/** One learner's ratings on the version they started. */
export async function listEnrollmentClarity(
	database: ClarityDb,
	enrollmentId: string,
): Promise<TaskClarity[]> {
	const rows = await database
		.select({ taskId: taskClarity.taskId, rating: taskClarity.rating })
		.from(taskClarity)
		.where(eq(taskClarity.enrollmentId, enrollmentId));
	const ratings: TaskClarity[] = [];
	for (const row of rows) {
		const rating = clarityRating(row.rating);
		if (rating) ratings.push({ taskId: row.taskId, rating });
	}
	return ratings;
}

/** Counts for the author. Names stay off this list. */
export async function listCourseClarity(
	database: ClarityDb,
	courseId: string,
): Promise<ClarityCount[]> {
	const [course] = await database
		.select({ id: courses.id })
		.from(courses)
		.where(eq(courses.id, courseId))
		.limit(1);
	if (!course) throw errors.notFound("That course was not found.");
	const rows = await database
		.select({ taskId: taskClarity.taskId, rating: taskClarity.rating })
		.from(taskClarity)
		.innerJoin(enrollments, eq(enrollments.id, taskClarity.enrollmentId))
		.where(eq(enrollments.courseId, courseId));
	const counts = new Map<string, ClarityCount>();
	for (const row of rows) {
		const rating = clarityRating(row.rating);
		if (!rating) continue;
		const current = counts.get(row.taskId) ?? {
			taskId: row.taskId,
			clear: 0,
			hard: 0,
		};
		if (rating === "clear") current.clear += 1;
		else current.hard += 1;
		counts.set(row.taskId, current);
	}
	return [...counts.values()];
}

/** Replace the learner's rating on a task in the pinned version. */
export async function saveTaskClarity(
	database: ClarityDb,
	input: {
		enrollmentId: string;
		taskId: string;
		rating: ClarityRating;
		actorId: number;
		ip: string;
	},
): Promise<TaskClarity> {
	const pinned = await pinnedTaskIds(database, input.enrollmentId);
	if (!pinned) throw errors.notFound("That enrollment was not found.");
	if (!pinned.has(input.taskId)) {
		throw errors.notFound("That task is not in this enrollment.");
	}
	const existing = await database
		.select({ id: taskClarity.id })
		.from(taskClarity)
		.where(
			and(
				eq(taskClarity.enrollmentId, input.enrollmentId),
				eq(taskClarity.taskId, input.taskId),
			),
		)
		.limit(1);
	if (existing.length === 0) {
		await database.insert(taskClarity).values({
			enrollmentId: input.enrollmentId,
			taskId: input.taskId,
			rating: input.rating,
		});
	} else {
		await database
			.update(taskClarity)
			.set({ rating: input.rating, updatedAt: new Date() })
			.where(
				and(
					eq(taskClarity.enrollmentId, input.enrollmentId),
					eq(taskClarity.taskId, input.taskId),
				),
			);
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "learning.task_clarity",
		targetType: "task",
		targetId: input.taskId,
		ipAddress: input.ip,
		metadata: { rating: input.rating, enrollmentId: input.enrollmentId },
	});
	return { taskId: input.taskId, rating: input.rating };
}

async function pinnedTaskIds(
	database: ClarityDb,
	enrollmentId: string,
): Promise<Set<string> | null> {
	const [row] = await database
		.select({ snapshot: contentVersions.snapshot })
		.from(enrollments)
		.innerJoin(
			contentVersions,
			eq(contentVersions.id, enrollments.contentVersionId),
		)
		.where(eq(enrollments.id, enrollmentId))
		.limit(1);
	if (!row) return null;
	const ids = new Set<string>();
	for (const module of parseProgressSnapshot(row.snapshot)) {
		for (const task of module.tasks) ids.add(task.id);
	}
	return ids;
}
