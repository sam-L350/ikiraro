import { asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db";
import { courses, courseTranslations, modules, tasks } from "../../db/schema";
import type { ContentStatus } from "../../db/schema/content";
import { errors } from "../api/error";
import { writeAudit, writeEvent } from "../audit/write";
import { type CourseView, readCourse } from "./author";

type ReviewDb = Pick<Database, "insert" | "select" | "transaction" | "update">;

export type ReviewSummary = {
	id: string;
	status: ContentStatus;
	title: string;
	missingKinyarwanda: boolean;
	approved: boolean;
};

export type ReviewQueue = {
	waiting: ReviewSummary[];
	published: ReviewSummary[];
	retired: ReviewSummary[];
};

export type ReviewCourse = CourseView & {
	ownCourse: boolean;
};

type CourseRecord = {
	id: string;
	status: ContentStatus;
	createdByUserId: number | null;
	reviewedByUserId: number | null;
};

function isContentStatus(value: string): value is ContentStatus {
	switch (value) {
		case "draft":
		case "in_review":
		case "published":
		case "retired":
			return true;
		default:
			return false;
	}
}

async function loadCourse(
	database: ReviewDb,
	courseId: string,
): Promise<CourseRecord> {
	const [row] = await database
		.select({
			id: courses.id,
			status: courses.status,
			createdByUserId: courses.createdByUserId,
			reviewedByUserId: courses.reviewedByUserId,
		})
		.from(courses)
		.where(eq(courses.id, courseId))
		.limit(1);
	if (!row || !isContentStatus(row.status)) {
		throw errors.notFound("That course was not found.");
	}
	return {
		id: row.id,
		status: row.status,
		createdByUserId: row.createdByUserId,
		reviewedByUserId: row.reviewedByUserId,
	};
}

function ownCourse(record: CourseRecord, actorId: number): boolean {
	return record.createdByUserId !== null && record.createdByUserId === actorId;
}

function refuseOwnCourse(record: CourseRecord, actorId: number): void {
	if (ownCourse(record, actorId)) {
		throw errors.conflict(
			"You wrote this course, so someone else publishes it.",
			{
				reason: "own_course",
			},
		);
	}
}

async function setTreeStatus(
	database: Pick<Database, "select" | "update">,
	courseId: string,
	status: ContentStatus,
	courseFields: {
		reviewedByUserId?: number | null;
		reviewedAt?: Date | null;
		reviewNote?: string | null;
		publishedByUserId?: number | null;
		publishedAt?: Date | null;
		retiredAt?: Date | null;
	},
): Promise<void> {
	const retiredAt = status === "retired" ? new Date() : null;
	await database
		.update(courses)
		.set({ status, ...courseFields })
		.where(eq(courses.id, courseId));
	await database
		.update(modules)
		.set({ status, retiredAt })
		.where(eq(modules.courseId, courseId));
	const moduleRows = await database
		.select({ id: modules.id })
		.from(modules)
		.where(eq(modules.courseId, courseId));
	const moduleIds = moduleRows.map((row) => row.id);
	if (moduleIds.length > 0) {
		await database
			.update(tasks)
			.set({ status, retiredAt })
			.where(inArray(tasks.moduleId, moduleIds));
	}
}

function summaryFrom(
	lines: {
		id: string;
		status: string;
		reviewedByUserId: number | null;
		locale: string | null;
		title: string | null;
	}[],
): ReviewSummary | null {
	const head = lines[0];
	if (!head || !isContentStatus(head.status)) return null;
	const english = lines.find((row) => row.locale === "en");
	const kinyarwanda = lines.find((row) => row.locale === "rw");
	const titleEn = english?.title ?? "";
	const titleRw = kinyarwanda?.title ?? "";
	return {
		id: head.id,
		status: head.status,
		title: titleEn || titleRw,
		missingKinyarwanda: titleEn.length > 0 && titleRw.length === 0,
		approved: head.reviewedByUserId != null,
	};
}

export async function listReviewQueue(
	database: ReviewDb,
): Promise<ReviewQueue> {
	const rows = await database
		.select({
			id: courses.id,
			status: courses.status,
			reviewedByUserId: courses.reviewedByUserId,
			locale: courseTranslations.locale,
			title: courseTranslations.title,
		})
		.from(courses)
		.leftJoin(courseTranslations, eq(courseTranslations.courseId, courses.id))
		.where(inArray(courses.status, ["in_review", "published", "retired"]))
		.orderBy(asc(courses.createdAt));
	const ids = [...new Set(rows.map((row) => row.id))];
	const items = ids.flatMap((id) => {
		const item = summaryFrom(rows.filter((row) => row.id === id));
		return item ? [item] : [];
	});
	return {
		waiting: items.filter((item) => item.status === "in_review"),
		published: items.filter((item) => item.status === "published"),
		retired: items.filter((item) => item.status === "retired"),
	};
}

async function present(
	database: ReviewDb,
	courseId: string,
	actorId: number,
): Promise<ReviewCourse> {
	const record = await loadCourse(database, courseId);
	const course = await readCourse(database, courseId);
	return { ...course, ownCourse: ownCourse(record, actorId) };
}

export async function readReviewCourse(
	database: ReviewDb,
	input: { courseId: string; actorId: number },
): Promise<ReviewCourse> {
	return present(database, input.courseId, input.actorId);
}

export async function approveCourse(
	database: ReviewDb,
	input: { courseId: string; actorId: number; ip: string },
): Promise<ReviewCourse> {
	const record = await loadCourse(database, input.courseId);
	if (record.status !== "in_review") {
		throw errors.conflict("This course is not in review.", {
			reason: "not_in_review",
		});
	}
	refuseOwnCourse(record, input.actorId);
	if (record.reviewedByUserId !== null) {
		throw errors.conflict("This course is already approved.", {
			reason: "already_approved",
		});
	}
	await database.transaction(async (tx) => {
		await tx
			.update(courses)
			.set({ reviewedByUserId: input.actorId, reviewedAt: new Date() })
			.where(eq(courses.id, input.courseId));
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "content.approved",
			targetType: "course",
			targetId: input.courseId,
			ipAddress: input.ip,
		});
	});
	return present(database, input.courseId, input.actorId);
}

export async function returnCourse(
	database: ReviewDb,
	input: { courseId: string; note: string; actorId: number; ip: string },
): Promise<ReviewCourse> {
	const note = input.note.trim();
	if (!note) {
		throw errors.badRequest("Write the reason for sending it back.", {
			reason: "reason_required",
		});
	}
	const record = await loadCourse(database, input.courseId);
	if (record.status !== "in_review") {
		throw errors.conflict("This course is not in review.", {
			reason: "not_in_review",
		});
	}
	await database.transaction(async (tx) => {
		await setTreeStatus(tx, input.courseId, "draft", {
			reviewedByUserId: null,
			reviewedAt: null,
			reviewNote: note,
		});
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "content.returned",
			targetType: "course",
			targetId: input.courseId,
			ipAddress: input.ip,
			metadata: { note },
		});
	});
	return present(database, input.courseId, input.actorId);
}

export async function publishCourse(
	database: ReviewDb,
	input: { courseId: string; actorId: number; ip: string },
): Promise<ReviewCourse> {
	const record = await loadCourse(database, input.courseId);
	if (record.status !== "in_review") {
		throw errors.conflict("This course is not in review.", {
			reason: "not_in_review",
		});
	}
	refuseOwnCourse(record, input.actorId);
	if (record.reviewedByUserId === null) {
		throw errors.conflict("Approve the course before publishing it.", {
			reason: "not_approved",
		});
	}
	if (
		record.createdByUserId !== null &&
		record.reviewedByUserId === record.createdByUserId
	) {
		throw errors.conflict("The author cannot approve their own course.", {
			reason: "own_course",
		});
	}
	await database.transaction(async (tx) => {
		await setTreeStatus(tx, input.courseId, "published", {
			publishedByUserId: input.actorId,
			publishedAt: new Date(),
		});
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "content.published",
			targetType: "course",
			targetId: input.courseId,
			ipAddress: input.ip,
		});
		await writeEvent(tx, {
			name: "content.published",
			payload: { courseId: input.courseId },
		});
	});
	return present(database, input.courseId, input.actorId);
}

export async function retireCourse(
	database: ReviewDb,
	input: { courseId: string; actorId: number; ip: string },
): Promise<ReviewCourse> {
	const record = await loadCourse(database, input.courseId);
	if (record.status !== "published") {
		throw errors.conflict("Only a published course can be retired.", {
			reason: "not_published",
		});
	}
	await database.transaction(async (tx) => {
		await setTreeStatus(tx, input.courseId, "retired", {
			retiredAt: new Date(),
		});
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "content.retired",
			targetType: "course",
			targetId: input.courseId,
			ipAddress: input.ip,
		});
		await writeEvent(tx, {
			name: "content.retired",
			payload: { courseId: input.courseId },
		});
	});
	return present(database, input.courseId, input.actorId);
}
