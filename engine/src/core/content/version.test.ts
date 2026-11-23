import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import { contentVersions } from "../../db/schema";
import type { JsonValue } from "../../db/schema/compliance";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import {
	createCourse,
	createCriterion,
	createModule,
	createTask,
	openNextDraft,
	submitCourseForReview,
	updateTask,
} from "./author";
import { approveCourse, publishCourse } from "./review";

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

function taskTitle(snapshot: JsonValue): string {
	if (
		typeof snapshot !== "object" ||
		snapshot === null ||
		Array.isArray(snapshot)
	) {
		throw new Error("snapshot was not an object");
	}
	const modules = snapshot.modules;
	if (!Array.isArray(modules)) throw new Error("snapshot has no modules");
	const module = modules[0];
	if (typeof module !== "object" || module === null || Array.isArray(module)) {
		throw new Error("snapshot module was not an object");
	}
	const moduleTasks = module.tasks;
	if (!Array.isArray(moduleTasks)) throw new Error("snapshot has no tasks");
	const task = moduleTasks[0];
	if (typeof task !== "object" || task === null || Array.isArray(task)) {
		throw new Error("snapshot task was not an object");
	}
	if (typeof task.titleEn !== "string") {
		throw new Error("snapshot title was not a string");
	}
	return task.titleEn;
}

async function reasonOf(run: () => Promise<unknown>): Promise<string | null> {
	try {
		await run();
		return null;
	} catch (error) {
		if (!isApiError(error)) throw error;
		const details = error.details as { reason?: string } | undefined;
		return details?.reason ?? error.message;
	}
}

async function titleOf(
	database: NonNullable<typeof suite>["db"],
	courseId: string,
	versionNumber: number,
): Promise<string> {
	const [row] = await database
		.select({ snapshot: contentVersions.snapshot })
		.from(contentVersions)
		.where(
			and(
				eq(contentVersions.courseId, courseId),
				eq(contentVersions.versionNumber, versionNumber),
			),
		)
		.limit(1);
	if (!row) throw new Error(`version ${versionNumber} was not stored`);
	return taskTitle(row.snapshot);
}

describe.serial("content versions", () => {
	test.skipIf(suite === null)(
		"editing a published course opens the next draft and leaves the pinned version unchanged",
		async () => {
			if (!suite) return;
			const database = suite.db;
			const author = await createUserWithPassport(database, {
				email: `author-${crypto.randomUUID()}@example.com`,
				name: "Author",
			});
			const reviewer = await createUserWithPassport(database, {
				email: `reviewer-${crypto.randomUUID()}@example.com`,
				name: "Reviewer",
			});
			const actor = { actorId: author.userId, ip: "test" };
			const reviewerActor = { actorId: reviewer.userId, ip: "test" };
			const draft = await createCourse(database, {
				...actor,
				titleEn: "Keep the ledger",
			});
			const withModule = await createModule(database, {
				...actor,
				courseId: draft.id,
				titleEn: "The page",
			});
			const moduleId = withModule.modules[0]?.id;
			if (!moduleId) throw new Error("module was not stored");
			const withTask = await createTask(database, {
				...actor,
				moduleId,
				titleEn: "Show the page",
				instructionsEn: "Photograph the page.",
			});
			const taskId = withTask.modules[0]?.tasks[0]?.id;
			if (!taskId) throw new Error("task was not stored");
			await updateTask(database, {
				...actor,
				taskId,
				titleEn: "Show the page",
				instructionsEn: "Photograph the page.",
				evidenceType: "photo",
			});
			await createCriterion(database, {
				...actor,
				taskId,
				weight: 1,
				promptEn: "The page is readable.",
			});
			await submitCourseForReview(database, { ...actor, courseId: draft.id });
			await approveCourse(database, { ...reviewerActor, courseId: draft.id });
			const published = await publishCourse(database, {
				...reviewerActor,
				courseId: draft.id,
			});
			expect(published.status).toBe("published");
			expect(await titleOf(database, draft.id, 1)).toBe("Show the page");

			expect(
				await reasonOf(() =>
					updateTask(database, {
						...actor,
						taskId,
						titleEn: "Show the new page",
						instructionsEn: "Photograph the page.",
						evidenceType: "photo",
					}),
				),
			).toBe("not_draft");

			const reopened = await openNextDraft(database, {
				...actor,
				courseId: draft.id,
			});
			expect(reopened.status).toBe("draft");
			expect(reopened.approved).toBe(false);
			await updateTask(database, {
				...actor,
				taskId,
				titleEn: "Show the new page",
				instructionsEn: "Photograph the page.",
				evidenceType: "photo",
			});
			expect(await titleOf(database, draft.id, 1)).toBe("Show the page");

			await submitCourseForReview(database, { ...actor, courseId: draft.id });
			await approveCourse(database, { ...reviewerActor, courseId: draft.id });
			const again = await publishCourse(database, {
				...reviewerActor,
				courseId: draft.id,
			});
			expect(again.modules[0]?.tasks[0]?.titleEn).toBe("Show the new page");
			expect(await titleOf(database, draft.id, 1)).toBe("Show the page");
			expect(await titleOf(database, draft.id, 2)).toBe("Show the new page");
		},
		120_000,
	);
});
