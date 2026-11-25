import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	contentVersions,
	enrollments,
	learningCenters,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import {
	createCourse,
	createCriterion,
	createModule,
	createTask,
	openNextDraft,
	saveBadge,
	submitCourseForReview,
	updateCourse,
	updateTask,
} from "../content/author";
import { approveCourse, publishCourse, retireCourse } from "../content/review";
import { createUserWithPassport } from "../identity/create-user";
import {
	type CatalogLanguage,
	catalogOutline,
	enrollInCourse,
	listCatalog,
	matchesCatalog,
	parsePublishedCourse,
} from "./catalog";

function isUsable(url: string): boolean {
	try {
		return new URL(url).hostname !== "db";
	} catch {
		return false;
	}
}

function databaseUrl(): string | null {
	const fromEnv = process.env.DATABASE_URL;
	if (fromEnv && isUsable(fromEnv)) return fromEnv;
	try {
		const path = resolve(
			dirname(fileURLToPath(import.meta.url)),
			"../../../.env.local",
		);
		const text = readFileSync(path, "utf8");
		for (const line of text.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed.startsWith("DATABASE_URL=")) continue;
			const value = trimmed
				.slice("DATABASE_URL=".length)
				.trim()
				.replace(/^['"]|['"]$/g, "");
			if (isUsable(value)) return value;
		}
	} catch {
		return null;
	}
	return null;
}

function openDatabase() {
	const url = databaseUrl();
	if (!url) return null;
	const client = postgres(url, { max: 1, connect_timeout: 15 });
	return { client, db: drizzle({ client, schema }) };
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe("catalog filters", () => {
	test("an old snapshot without catalog fields still lists at level 1", () => {
		const parsed = parsePublishedCourse("course", "version", 1, {
			titleEn: "Hello",
			titleRw: "",
		});
		expect(parsed?.level).toBe(1);
		expect(parsed?.category).toBe("");
		expect(parsed?.economicSector).toBe("");
		expect(parsed?.languages).toEqual(["en"]);
		expect(catalogOutline({ titleEn: "Hello" })).toEqual([]);
	});

	test("the outline keeps module and task titles in position order", () => {
		expect(
			catalogOutline({
				modules: [
					{
						id: "later",
						position: 2,
						titleEn: "The stall",
						titleRw: "",
						summaryEn: "",
						summaryRw: "",
						tasks: [],
					},
					{
						id: "first",
						position: 1,
						titleEn: "The store",
						titleRw: "Ububiko",
						summaryEn: "Where the bags sit.",
						summaryRw: "",
						tasks: [
							{
								id: "count",
								position: 2,
								titleEn: "Count the bags",
								titleRw: "",
								evidenceType: "note",
								required: true,
							},
							{
								id: "open",
								position: 1,
								titleEn: "Open the book",
								titleRw: "",
								evidenceType: "photo",
								required: false,
							},
						],
					},
				],
			}),
		).toEqual([
			{
				moduleId: "first",
				titleEn: "The store",
				titleRw: "Ububiko",
				summaryEn: "Where the bags sit.",
				summaryRw: "",
				tasks: [
					{
						taskId: "open",
						titleEn: "Open the book",
						titleRw: "",
						evidenceType: "photo",
						required: false,
					},
					{
						taskId: "count",
						titleEn: "Count the bags",
						titleRw: "",
						evidenceType: "note",
						required: true,
					},
				],
			},
			{
				moduleId: "later",
				titleEn: "The stall",
				titleRw: "",
				summaryEn: "",
				summaryRw: "",
				tasks: [],
			},
		]);
	});

	test("category and sector ignore case, and level is exact", () => {
		const course = {
			category: "Crops",
			economicSector: "Agriculture",
			level: 2,
			languages: ["en", "rw"] satisfies CatalogLanguage[],
		};
		expect(matchesCatalog(course, { category: "crops" })).toBe(true);
		expect(matchesCatalog(course, { sector: "AGRICULTURE" })).toBe(true);
		expect(matchesCatalog(course, { level: 2, language: "rw" })).toBe(true);
		expect(matchesCatalog(course, { level: 1 })).toBe(false);
		expect(matchesCatalog(course, { language: "fr" })).toBe(false);
		expect(matchesCatalog(course, {})).toBe(true);
	});
});

describe.serial("enrollment pin", () => {
	test.skipIf(suite === null)(
		"enrollment stays on the version the learner started, and the catalog follows the latest publish",
		async () => {
			if (!suite) return;
			const database = suite.db;
			const [center] = await database
				.select({ id: learningCenters.id })
				.from(learningCenters)
				.limit(1);
			if (!center) throw new Error("no learning center is seeded");
			const author = await createUserWithPassport(database, {
				email: `author-${crypto.randomUUID()}@example.com`,
				name: "Author",
			});
			const reviewer = await createUserWithPassport(database, {
				email: `reviewer-${crypto.randomUUID()}@example.com`,
				name: "Reviewer",
			});
			const learner = await createUserWithPassport(database, {
				email: `learner-${crypto.randomUUID()}@example.com`,
				name: "Learner",
			});
			await database
				.update(users)
				.set({ centerId: center.id })
				.where(eq(users.id, learner.userId));
			const actor = { actorId: author.userId, ip: "test" };
			const reviewerActor = { actorId: reviewer.userId, ip: "test" };
			const draft = await createCourse(database, {
				...actor,
				titleEn: "Keep the harvest",
				titleRw: "Kubika umusaruro",
				category: "Crops",
				economicSector: "Agriculture",
				level: 2,
			});
			const withModule = await createModule(database, {
				...actor,
				courseId: draft.id,
				titleEn: "The store",
			});
			const moduleId = withModule.modules[0]?.id;
			if (!moduleId) throw new Error("module was not stored");
			const withTask = await createTask(database, {
				...actor,
				moduleId,
				titleEn: "Count the bags",
			});
			const task = withTask.modules[0]?.tasks[0];
			if (!task) throw new Error("task was not stored");
			await updateTask(database, {
				...actor,
				taskId: task.id,
				titleEn: "Count the bags",
				evidenceType: "note",
			});
			await createCriterion(database, {
				...actor,
				taskId: task.id,
				weight: 1,
				promptEn: "The count matches the bags.",
			});
			await saveBadge(database, {
				...actor,
				courseId: draft.id,
				titleEn: "Harvest keeper",
				level: 2,
				allRequiredTasksApproved: true,
				minimumScore: null,
				minimumHours: null,
			});

			let unpublished: unknown;
			try {
				await enrollInCourse(database, {
					userId: learner.userId,
					courseId: draft.id,
					centerId: center.id,
					actorId: learner.userId,
					ip: "test",
				});
			} catch (error) {
				unpublished = error;
			}
			if (!isApiError(unpublished)) {
				throw new Error("enrolling an unpublished course should fail");
			}
			expect(unpublished.details).toEqual({ reason: "not_published" });

			await submitCourseForReview(database, { ...actor, courseId: draft.id });
			await approveCourse(database, { ...reviewerActor, courseId: draft.id });
			await publishCourse(database, { ...reviewerActor, courseId: draft.id });

			const started = await enrollInCourse(database, {
				userId: learner.userId,
				courseId: draft.id,
				centerId: center.id,
				actorId: learner.userId,
				ip: "test",
			});
			const [firstVersion] = await database
				.select({ id: contentVersions.id })
				.from(contentVersions)
				.where(
					and(
						eq(contentVersions.courseId, draft.id),
						eq(contentVersions.versionNumber, 1),
					),
				)
				.limit(1);
			if (!firstVersion) throw new Error("version 1 was not stored");
			expect(started.contentVersionId).toBe(firstVersion.id);
			expect(started.versionNumber).toBe(1);

			let duplicate: unknown;
			try {
				await enrollInCourse(database, {
					userId: learner.userId,
					courseId: draft.id,
					centerId: center.id,
					actorId: learner.userId,
					ip: "test",
				});
			} catch (error) {
				duplicate = error;
			}
			if (!isApiError(duplicate)) {
				throw new Error("a second enrollment should fail");
			}
			expect(duplicate.details).toEqual({ reason: "already_enrolled" });

			await openNextDraft(database, { ...actor, courseId: draft.id });
			await updateCourse(database, {
				...actor,
				courseId: draft.id,
				titleEn: "Keep the harvest",
				titleRw: "Kubika umusaruro",
				category: "Livestock",
			});
			await submitCourseForReview(database, { ...actor, courseId: draft.id });
			await approveCourse(database, { ...reviewerActor, courseId: draft.id });
			await publishCourse(database, { ...reviewerActor, courseId: draft.id });

			const [pinned] = await database
				.select({ contentVersionId: enrollments.contentVersionId })
				.from(enrollments)
				.where(eq(enrollments.id, started.id))
				.limit(1);
			expect(pinned?.contentVersionId).toBe(started.contentVersionId);

			const livestock = await listCatalog(database, {
				userId: learner.userId,
				filter: { category: "livestock", sector: "agriculture", level: 2 },
			});
			expect(livestock.some((course) => course.courseId === draft.id)).toBe(
				true,
			);
			const crops = await listCatalog(database, {
				userId: learner.userId,
				filter: { category: "Crops" },
			});
			expect(crops.some((course) => course.courseId === draft.id)).toBe(false);
			const listed = livestock.find((course) => course.courseId === draft.id);
			expect(listed?.enrolled).toBe(true);
			expect(listed?.level).toBe(2);

			await retireCourse(database, { ...reviewerActor, courseId: draft.id });
			const afterRetire = await listCatalog(database, {
				userId: learner.userId,
				filter: { category: "Livestock" },
			});
			expect(afterRetire.some((course) => course.courseId === draft.id)).toBe(
				false,
			);
			const [stillPinned] = await database
				.select({ contentVersionId: enrollments.contentVersionId })
				.from(enrollments)
				.where(eq(enrollments.id, started.id))
				.limit(1);
			expect(stillPinned?.contentVersionId).toBe(started.contentVersionId);
		},
		180_000,
	);
});
