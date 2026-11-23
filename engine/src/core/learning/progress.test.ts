import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import { contentVersions, learningCenters, users } from "../../db/schema";
import { isApiError } from "../api/error";
import {
	createCourse,
	createCriterion,
	createModule,
	createTask,
	openNextDraft,
	saveBadge,
	submitCourseForReview,
	updateModule,
	updateTask,
} from "../content/author";
import { approveCourse, publishCourse } from "../content/review";
import { createUserWithPassport } from "../identity/create-user";
import { enrollInCourse } from "./catalog";
import {
	completeTaskProgress,
	deriveNextTask,
	parseProgressSnapshot,
	readEnrollmentProgress,
} from "./progress";

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

describe("next task", () => {
	test("an old snapshot with no prerequisites starts at the first required task", () => {
		const modules = parseProgressSnapshot({
			modules: [
				{
					id: "module-a",
					position: 0,
					titleEn: "First",
					tasks: [
						{ id: "task-a", position: 0, required: true, titleEn: "Open" },
						{ id: "task-b", position: 1, required: false, titleEn: "Extra" },
					],
				},
				{
					id: "module-b",
					position: 1,
					titleEn: "Second",
					tasks: [
						{ id: "task-c", position: 0, required: true, titleEn: "Count" },
					],
				},
			],
		});
		expect(deriveNextTask(modules, new Set())?.taskId).toBe("task-a");
		expect(deriveNextTask(modules, new Set(["task-a"]))?.taskId).toBe("task-c");
		expect(deriveNextTask(modules, new Set(["task-a", "task-c"]))).toBeNull();
	});

	test("a module stays closed until every required earlier module is complete", () => {
		const modules = parseProgressSnapshot({
			modules: [
				{
					id: "module-a",
					position: 0,
					tasks: [{ id: "task-a", position: 0, required: true }],
				},
				{
					id: "module-b",
					position: 1,
					requires: ["module-a"],
					tasks: [{ id: "task-b", position: 0, required: true }],
				},
			],
		});
		expect(deriveNextTask(modules, new Set())?.taskId).toBe("task-a");
		expect(deriveNextTask(modules, new Set(["task-b"]))?.taskId).toBe("task-a");
		expect(deriveNextTask(modules, new Set(["task-a"]))?.taskId).toBe("task-b");
	});
});

describe.serial("pinned prerequisites", () => {
	test.skipIf(suite === null)(
		"the next task follows the pinned version after a later draft drops a prerequisite",
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
			const later = await createUserWithPassport(database, {
				email: `learner-${crypto.randomUUID()}@example.com`,
				name: "Later",
			});
			await database
				.update(users)
				.set({ centerId: center.id })
				.where(eq(users.id, learner.userId));
			await database
				.update(users)
				.set({ centerId: center.id })
				.where(eq(users.id, later.userId));
			const actor = { actorId: author.userId, ip: "test" };
			const reviewerActor = { actorId: reviewer.userId, ip: "test" };
			const draft = await createCourse(database, {
				...actor,
				titleEn: "Count the store",
			});
			const withFirst = await createModule(database, {
				...actor,
				courseId: draft.id,
				titleEn: "The shelf",
			});
			const first = withFirst.modules[0];
			if (!first) throw new Error("first module was not stored");
			const withSecond = await createModule(database, {
				...actor,
				courseId: draft.id,
				titleEn: "The book",
			});
			const second = withSecond.modules[1];
			if (!second) throw new Error("second module was not stored");
			await updateModule(database, {
				...actor,
				moduleId: second.id,
				titleEn: "The book",
				requires: [first.id],
			});
			let laterModule: unknown;
			try {
				await updateModule(database, {
					...actor,
					moduleId: first.id,
					titleEn: "The shelf",
					requires: [second.id],
				});
			} catch (error) {
				laterModule = error;
			}
			if (!isApiError(laterModule)) {
				throw new Error("a module should not require a later one");
			}
			expect(laterModule.details).toEqual({ reason: "not_earlier" });

			for (const module of [first, second]) {
				const withTask = await createTask(database, {
					...actor,
					moduleId: module.id,
					titleEn: module.titleEn,
				});
				const task = withTask.modules
					.flatMap((item) => item.tasks)
					.find((item) => item.titleEn === module.titleEn);
				if (!task) throw new Error("task was not stored");
				await updateTask(database, {
					...actor,
					taskId: task.id,
					titleEn: module.titleEn,
					evidenceType: "note",
				});
				await createCriterion(database, {
					...actor,
					taskId: task.id,
					weight: 1,
					promptEn: "The count is written down.",
				});
			}
			await saveBadge(database, {
				...actor,
				courseId: draft.id,
				titleEn: "Store count",
				level: 1,
				allRequiredTasksApproved: true,
				minimumScore: null,
				minimumHours: null,
			});
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
			const progress = await readEnrollmentProgress(database, started.id);
			const book = progress.modules.find((module) => module.id === second.id);
			const shelfTask = progress.modules.find(
				(module) => module.id === first.id,
			)?.tasks[0];
			const bookTask = book?.tasks[0];
			if (!shelfTask || !bookTask) throw new Error("tasks were not pinned");
			expect(progress.next?.taskId).toBe(shelfTask.id);
			expect(book?.status).toBe("locked");

			let blocked: unknown;
			try {
				await completeTaskProgress(database, {
					enrollmentId: started.id,
					taskId: bookTask.id,
					actorId: learner.userId,
					ip: "test",
				});
			} catch (error) {
				blocked = error;
			}
			if (!isApiError(blocked)) {
				throw new Error("the later module should stay closed");
			}
			expect(blocked.details).toEqual({ reason: "prerequisite" });

			await openNextDraft(database, { ...actor, courseId: draft.id });
			await updateModule(database, {
				...actor,
				moduleId: second.id,
				titleEn: "The book",
				requires: [],
			});
			await submitCourseForReview(database, { ...actor, courseId: draft.id });
			await approveCourse(database, { ...reviewerActor, courseId: draft.id });
			await publishCourse(database, { ...reviewerActor, courseId: draft.id });

			let stillBlocked: unknown;
			try {
				await completeTaskProgress(database, {
					enrollmentId: started.id,
					taskId: bookTask.id,
					actorId: learner.userId,
					ip: "test",
				});
			} catch (error) {
				stillBlocked = error;
			}
			if (!isApiError(stillBlocked)) {
				throw new Error("the pin should keep the earlier prerequisite");
			}
			expect(stillBlocked.details).toEqual({ reason: "prerequisite" });

			const afterShelf = await completeTaskProgress(database, {
				enrollmentId: started.id,
				taskId: shelfTask.id,
				actorId: learner.userId,
				ip: "test",
			});
			expect(afterShelf.next?.taskId).toBe(bookTask.id);
			expect(afterShelf.requiredComplete).toBe(1);
			const finished = await completeTaskProgress(database, {
				enrollmentId: started.id,
				taskId: bookTask.id,
				actorId: learner.userId,
				ip: "test",
			});
			expect(finished.next).toBeNull();
			expect(finished.requiredComplete).toBe(finished.requiredTotal);

			const secondStart = await enrollInCourse(database, {
				userId: later.userId,
				courseId: draft.id,
				centerId: center.id,
				actorId: later.userId,
				ip: "test",
			});
			const opened = await readEnrollmentProgress(database, secondStart.id);
			const laterBook = opened.modules.find(
				(module) => module.id === second.id,
			);
			expect(laterBook?.status).toBe("not_started");
			const laterBookTask = laterBook?.tasks[0];
			if (!laterBookTask) throw new Error("later task was not pinned");
			const skipped = await completeTaskProgress(database, {
				enrollmentId: secondStart.id,
				taskId: laterBookTask.id,
				actorId: later.userId,
				ip: "test",
			});
			expect(
				skipped.modules.find((module) => module.id === second.id)?.status,
			).toBe("complete");

			const [firstVersion] = await database
				.select({ snapshot: contentVersions.snapshot })
				.from(contentVersions)
				.where(
					and(
						eq(contentVersions.courseId, draft.id),
						eq(contentVersions.versionNumber, 1),
					),
				)
				.limit(1);
			const [secondVersion] = await database
				.select({ snapshot: contentVersions.snapshot })
				.from(contentVersions)
				.where(
					and(
						eq(contentVersions.courseId, draft.id),
						eq(contentVersions.versionNumber, 2),
					),
				)
				.limit(1);
			if (!firstVersion || !secondVersion) {
				throw new Error("versions were not stored");
			}
			const pinnedRequires = parseProgressSnapshot(firstVersion.snapshot).find(
				(module) => module.id === second.id,
			)?.requires;
			const latestRequires = parseProgressSnapshot(secondVersion.snapshot).find(
				(module) => module.id === second.id,
			)?.requires;
			expect(pinnedRequires).toEqual([first.id]);
			expect(latestRequires).toEqual([]);
		},
		180_000,
	);
});
