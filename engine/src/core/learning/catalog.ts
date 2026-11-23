import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db";
import {
	contentVersions,
	courses,
	enrollments,
	learningCenters,
	roles,
	userRoles,
	users,
} from "../../db/schema";
import type { JsonValue } from "../../db/schema/compliance";
import { errors } from "../api/error";
import { writeAudit, writeEvent } from "../audit/write";

type CatalogDb = Pick<Database, "insert" | "select" | "transaction">;

export type CatalogLanguage = "rw" | "en";

export type CatalogCourse = {
	courseId: string;
	versionId: string;
	versionNumber: number;
	titleEn: string;
	titleRw: string;
	summaryEn: string;
	summaryRw: string;
	category: string;
	economicSector: string;
	level: number;
	languages: CatalogLanguage[];
	enrolled: boolean;
};

export type CatalogFilter = {
	language?: string;
	category?: string;
	sector?: string;
	level?: number;
};

export type EnrollmentView = {
	id: string;
	courseId: string;
	contentVersionId: string;
	versionNumber: number;
	centerId: string;
	startedAt: string;
};

type ParsedCourse = Omit<CatalogCourse, "enrolled">;

function clean(value: string | undefined): string {
	return (value ?? "").trim();
}

function sameText(left: string, right: string): boolean {
	return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function isLanguage(value: string): value is CatalogLanguage {
	switch (value) {
		case "rw":
		case "en":
			return true;
		default:
			return false;
	}
}

function textOf(record: Record<string, JsonValue>, key: string): string {
	const value = record[key];
	return typeof value === "string" ? value : "";
}

function levelOf(record: Record<string, JsonValue>): number {
	const value = record.level;
	if (typeof value === "number" && Number.isInteger(value) && value > 0) {
		return value;
	}
	return 1;
}

function asRecord(value: JsonValue): Record<string, JsonValue> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	return value;
}

export function parsePublishedCourse(
	courseId: string,
	versionId: string,
	versionNumber: number,
	snapshot: JsonValue,
): ParsedCourse | null {
	const record = asRecord(snapshot);
	if (!record) return null;
	const titleEn = textOf(record, "titleEn");
	const titleRw = textOf(record, "titleRw");
	const languages: CatalogLanguage[] = [];
	if (titleEn.length > 0) languages.push("en");
	if (titleRw.length > 0) languages.push("rw");
	return {
		courseId,
		versionId,
		versionNumber,
		titleEn,
		titleRw,
		summaryEn: textOf(record, "summaryEn"),
		summaryRw: textOf(record, "summaryRw"),
		category: textOf(record, "category"),
		economicSector: textOf(record, "economicSector"),
		level: levelOf(record),
		languages,
	};
}

export function matchesCatalog(
	course: Pick<
		CatalogCourse,
		"category" | "economicSector" | "level" | "languages"
	>,
	filter: CatalogFilter,
): boolean {
	const language = clean(filter.language);
	if (language) {
		if (!isLanguage(language)) return false;
		if (!course.languages.includes(language)) return false;
	}
	const category = clean(filter.category);
	if (category && !sameText(course.category, category)) return false;
	const sector = clean(filter.sector);
	if (sector && !sameText(course.economicSector, sector)) return false;
	if (filter.level !== undefined && course.level !== filter.level) return false;
	return true;
}

export async function listCatalog(
	database: CatalogDb,
	input: { userId: number; filter: CatalogFilter },
): Promise<CatalogCourse[]> {
	const language = clean(input.filter.language);
	if (language && !isLanguage(language)) {
		throw errors.badRequest("Choose Kinyarwanda or English.", {
			reason: "invalid_language",
		});
	}
	const versions = await database
		.select({
			id: contentVersions.id,
			courseId: contentVersions.courseId,
			versionNumber: contentVersions.versionNumber,
			snapshot: contentVersions.snapshot,
			status: courses.status,
		})
		.from(contentVersions)
		.innerJoin(courses, eq(courses.id, contentVersions.courseId))
		.orderBy(desc(contentVersions.versionNumber));
	const latest = new Map<string, ParsedCourse>();
	for (const row of versions) {
		if (latest.has(row.courseId) || row.status === "retired") continue;
		const parsed = parsePublishedCourse(
			row.courseId,
			row.id,
			row.versionNumber,
			row.snapshot,
		);
		if (parsed) latest.set(row.courseId, parsed);
	}
	const enrolled = await database
		.select({ courseId: enrollments.courseId })
		.from(enrollments)
		.where(eq(enrollments.userId, input.userId));
	const enrolledIds = new Set(enrolled.map((row) => row.courseId));
	return [...latest.values()]
		.filter((course) => matchesCatalog(course, input.filter))
		.map((course) => ({
			...course,
			enrolled: enrolledIds.has(course.courseId),
		}));
}

export async function readCatalogCourse(
	database: CatalogDb,
	input: { userId: number; courseId: string },
): Promise<CatalogCourse> {
	const coursesInCatalog = await listCatalog(database, {
		userId: input.userId,
		filter: {},
	});
	const course = coursesInCatalog.find(
		(row) => row.courseId === input.courseId,
	);
	if (!course) throw errors.notFound("That course is not in the catalog.");
	return course;
}

async function homeCenter(
	database: CatalogDb,
	userId: number,
): Promise<string> {
	const [person] = await database
		.select({ centerId: users.centerId, deletedAt: users.deletedAt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!person || person.deletedAt) {
		throw errors.notFound("That learner was not found.");
	}
	if (!person.centerId) {
		throw errors.conflict("This learner has no home center.", {
			reason: "center_required",
		});
	}
	return person.centerId;
}

function isUniqueViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if ("code" in error && error.code === "23505") return true;
	if ("cause" in error) return isUniqueViolation(error.cause);
	return false;
}

export async function enrollInCourse(
	database: CatalogDb,
	input: {
		userId: number;
		courseId: string;
		centerId: string;
		actorId: number;
		ip: string;
	},
): Promise<EnrollmentView> {
	const center = await homeCenter(database, input.userId);
	if (center !== input.centerId) {
		throw errors.conflict("Enroll this learner at their home center.", {
			reason: "wrong_center",
		});
	}
	const [centerRow] = await database
		.select({ id: learningCenters.id })
		.from(learningCenters)
		.where(eq(learningCenters.id, input.centerId))
		.limit(1);
	if (!centerRow) throw errors.notFound("That center was not found.");
	const [course] = await database
		.select({ status: courses.status })
		.from(courses)
		.where(eq(courses.id, input.courseId))
		.limit(1);
	if (!course || course.status === "retired") {
		throw errors.notFound("That course is not in the catalog.");
	}
	const [version] = await database
		.select({
			id: contentVersions.id,
			versionNumber: contentVersions.versionNumber,
		})
		.from(contentVersions)
		.where(eq(contentVersions.courseId, input.courseId))
		.orderBy(desc(contentVersions.versionNumber))
		.limit(1);
	if (!version) {
		throw errors.conflict("This course has not been published.", {
			reason: "not_published",
		});
	}
	try {
		return await database.transaction(async (tx) => {
			const [created] = await tx
				.insert(enrollments)
				.values({
					userId: input.userId,
					courseId: input.courseId,
					contentVersionId: version.id,
					centerId: input.centerId,
					enrolledByUserId: input.actorId,
				})
				.returning({
					id: enrollments.id,
					startedAt: enrollments.startedAt,
				});
			if (!created) throw errors.internal("The enrollment was not stored.");
			await writeAudit(tx, {
				actorId: input.actorId,
				action: "learning.enrolled",
				targetType: "enrollment",
				targetId: created.id,
				ipAddress: input.ip,
			});
			await writeEvent(tx, {
				name: "learning.enrolled",
				payload: {
					enrollmentId: created.id,
					userId: input.userId,
					courseId: input.courseId,
					contentVersionId: version.id,
					centerId: input.centerId,
				},
			});
			return {
				id: created.id,
				courseId: input.courseId,
				contentVersionId: version.id,
				versionNumber: version.versionNumber,
				centerId: input.centerId,
				startedAt: created.startedAt.toISOString(),
			};
		});
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		throw errors.conflict("This learner is already enrolled.", {
			reason: "already_enrolled",
		});
	}
}

export async function listCenterLearners(
	database: CatalogDb,
	centerId: string,
): Promise<{ id: number; name: string }[]> {
	const rows = await database
		.select({ id: users.id, name: users.name })
		.from(users)
		.innerJoin(userRoles, eq(userRoles.userId, users.id))
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(
			and(
				eq(users.centerId, centerId),
				eq(roles.code, "learner"),
				isNull(users.deletedAt),
			),
		);
	const seen = new Map<number, string>();
	for (const row of rows) seen.set(row.id, row.name ?? "");
	return [...seen.entries()].map(([id, name]) => ({ id, name }));
}
