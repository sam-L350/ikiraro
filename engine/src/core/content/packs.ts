import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db";
import {
	centerStaff,
	contentVersions,
	courses,
	learningCenters,
} from "../../db/schema";
import type { JsonValue } from "../../db/schema/compliance";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";

type PackDb = Pick<Database, "select" | "insert">;

export type PackCenter = { id: string; name: string };

export type PackCourse = {
	id: string;
	titleEn: string;
	titleRw: string;
};

export type ContentPackList = {
	centers: PackCenter[];
	courses: PackCourse[];
};

export type ContentPackFile = { file: string };

const STAFF = ["trainer", "center_manager"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function textOf(record: Record<string, unknown> | null, key: string): string {
	const value = record?.[key];
	return typeof value === "string" ? value : "";
}

async function centersFor(
	database: PackDb,
	userId: number,
): Promise<PackCenter[]> {
	const rows = await database
		.select({ id: learningCenters.id, name: learningCenters.name })
		.from(centerStaff)
		.innerJoin(learningCenters, eq(learningCenters.id, centerStaff.centerId))
		.where(
			and(
				eq(centerStaff.userId, userId),
				inArray(centerStaff.role, [...STAFF]),
			),
		);
	const seen = new Set<string>();
	const centers: PackCenter[] = [];
	for (const row of rows) {
		if (seen.has(row.id)) continue;
		seen.add(row.id);
		centers.push(row);
	}
	centers.sort((left, right) => left.name.localeCompare(right.name));
	return centers;
}

async function publishedCourses(database: PackDb): Promise<
	{
		courseId: string;
		versionId: string;
		versionNumber: number;
		publishedAt: Date;
		snapshot: JsonValue;
		titleEn: string;
		titleRw: string;
	}[]
> {
	const rows = await database
		.select({
			courseId: contentVersions.courseId,
			versionId: contentVersions.id,
			versionNumber: contentVersions.versionNumber,
			publishedAt: contentVersions.publishedAt,
			snapshot: contentVersions.snapshot,
		})
		.from(contentVersions)
		.innerJoin(courses, eq(courses.id, contentVersions.courseId))
		.where(eq(courses.status, "published"));
	const latest = new Map<string, (typeof rows)[number]>();
	for (const row of rows) {
		const current = latest.get(row.courseId);
		if (!current || row.versionNumber > current.versionNumber) {
			latest.set(row.courseId, row);
		}
	}
	return [...latest.values()].map((row) => {
		const snapshot = asRecord(row.snapshot);
		return {
			...row,
			titleEn: textOf(snapshot, "titleEn"),
			titleRw: textOf(snapshot, "titleRw"),
		};
	});
}

/** Centers this person works at, and the published courses a pack can hold. */
export async function listContentPacks(
	database: PackDb,
	userId: number,
): Promise<ContentPackList> {
	const centers = await centersFor(database, userId);
	if (centers.length === 0) {
		throw errors.forbidden("A trainer at the center downloads a course pack.", {
			reason: "scope",
		});
	}
	const courses = (await publishedCourses(database))
		.map((row) => ({
			id: row.courseId,
			titleEn: row.titleEn,
			titleRw: row.titleRw,
		}))
		.sort((left, right) => left.titleEn.localeCompare(right.titleEn));
	return { centers, courses };
}

/** The published course, labeled for one center. Learner rows are not in it. */
export async function downloadContentPack(
	database: PackDb,
	input: { userId: number; centerId: string; courseId: string; ip: string },
): Promise<ContentPackFile> {
	const centerId = input.centerId.trim();
	const courseId = input.courseId.trim();
	if (!centerId) {
		throw errors.badRequest("Choose a center.", { reason: "center" });
	}
	if (!courseId) {
		throw errors.badRequest("Choose a course.", { reason: "course" });
	}
	const centers = await centersFor(database, input.userId);
	const center = centers.find((row) => row.id === centerId);
	if (!center) {
		throw errors.forbidden("A trainer at the center downloads a course pack.", {
			reason: "scope",
		});
	}
	const course = (await publishedCourses(database)).find(
		(row) => row.courseId === courseId,
	);
	if (!course) throw errors.notFound("That course has no published pack.");
	const file = JSON.stringify({
		centerId: center.id,
		centerName: center.name,
		courseId: course.courseId,
		versionId: course.versionId,
		versionNumber: course.versionNumber,
		publishedAt: course.publishedAt.toISOString(),
		course: course.snapshot,
	});
	await writeAudit(database, {
		actorId: input.userId,
		action: "content_pack.downloaded",
		targetType: "content_version",
		targetId: course.versionId,
		ipAddress: input.ip,
		metadata: { centerId: center.id, courseId: course.courseId },
	});
	return { file };
}
