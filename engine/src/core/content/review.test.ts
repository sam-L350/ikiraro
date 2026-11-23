import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import { contentVersions, tasks } from "../../db/schema";
import { isApiError } from "../api/error";
import { decideAccess } from "../authz/decide";
import { createUserWithPassport } from "../identity/create-user";
import {
	createCourse,
	createCriterion,
	createModule,
	createTask,
	submitCourseForReview,
	updateCourse,
	updateTask,
} from "./author";
import {
	approveCourse,
	publishCourse,
	retireCourse,
	returnCourse,
} from "./review";

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

test("an author cannot publish, and a reviewer can", () => {
	const author = decideAccess({
		actorId: "1",
		assignments: [
			{ role: "content_author", scopeType: "global", scopeId: "global" },
		],
		permission: "content.publish",
		resource: {},
	});
	expect(author.ok).toBe(false);
	const reviewer = decideAccess({
		actorId: "2",
		assignments: [
			{ role: "content_reviewer", scopeType: "global", scopeId: "global" },
		],
		permission: "content.publish",
		resource: {},
	});
	expect(reviewer.ok).toBe(true);
});

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

describe.serial("course review", () => {
	test.skipIf(suite === null)(
		"a reviewer approves before publishing, the author cannot publish their own course, and a retired course stays readable",
		async () => {
			if (!suite) return;
			const database = suite.db;
			const author = await createUser(database, "author");
			const reviewer = await createUser(database, "reviewer");
			const draft = await createCourse(database, {
				actorId: author,
				ip: "test",
				titleEn: "Keep the ledger",
				titleRw: "Bika igitabo",
			});
			const withModule = await createModule(database, {
				actorId: author,
				ip: "test",
				courseId: draft.id,
				titleEn: "The page",
				titleRw: "Paji",
			});
			const moduleId = withModule.modules[0]?.id;
			if (!moduleId) throw new Error("module was not stored");
			const withTask = await createTask(database, {
				actorId: author,
				ip: "test",
				moduleId,
				titleEn: "Show the page",
				instructionsEn: "Photograph the page.",
			});
			const taskId = withTask.modules[0]?.tasks[0]?.id;
			if (!taskId) throw new Error("task was not stored");
			await updateTask(database, {
				actorId: author,
				ip: "test",
				taskId,
				titleEn: "Show the page",
				instructionsEn: "Photograph the page.",
				evidenceType: "photo",
			});
			await createCriterion(database, {
				actorId: author,
				ip: "test",
				taskId,
				weight: 1,
				promptEn: "The page is readable.",
			});
			const submitted = await submitCourseForReview(database, {
				actorId: author,
				ip: "test",
				courseId: draft.id,
			});
			expect(submitted.approved).toBe(false);

			expect(
				await reasonOf(() =>
					publishCourse(database, {
						actorId: reviewer,
						ip: "test",
						courseId: draft.id,
					}),
				),
			).toBe("not_approved");
			expect(
				await reasonOf(() =>
					approveCourse(database, {
						actorId: author,
						ip: "test",
						courseId: draft.id,
					}),
				),
			).toBe("own_course");
			expect(
				await reasonOf(() =>
					returnCourse(database, {
						actorId: reviewer,
						ip: "test",
						courseId: draft.id,
						note: "   ",
					}),
				),
			).toBe("reason_required");

			const returned = await returnCourse(database, {
				actorId: reviewer,
				ip: "test",
				courseId: draft.id,
				note: "Add the Kinyarwanda instructions.",
			});
			expect(returned.status).toBe("draft");
			expect(returned.reviewNote).toBe("Add the Kinyarwanda instructions.");
			expect(returned.approved).toBe(false);
			await updateCourse(database, {
				actorId: author,
				ip: "test",
				courseId: draft.id,
				titleEn: "Keep the ledger",
				titleRw: "Bika igitabo",
			});

			await submitCourseForReview(database, {
				actorId: author,
				ip: "test",
				courseId: draft.id,
			});
			expect(
				await reasonOf(() =>
					publishCourse(database, {
						actorId: author,
						ip: "test",
						courseId: draft.id,
					}),
				),
			).toBe("own_course");

			const approved = await approveCourse(database, {
				actorId: reviewer,
				ip: "test",
				courseId: draft.id,
			});
			expect(approved.status).toBe("in_review");
			expect(approved.approved).toBe(true);
			expect(approved.ownCourse).toBe(false);

			const published = await publishCourse(database, {
				actorId: reviewer,
				ip: "test",
				courseId: draft.id,
			});
			expect(published.status).toBe("published");
			expect(published.modules[0]?.tasks[0]?.status).toBe("published");
			const versions = await database
				.select({ id: contentVersions.id })
				.from(contentVersions)
				.where(eq(contentVersions.courseId, draft.id));
			expect(versions).toHaveLength(0);

			const retired = await retireCourse(database, {
				actorId: reviewer,
				ip: "test",
				courseId: draft.id,
			});
			expect(retired.status).toBe("retired");
			expect(retired.modules[0]?.tasks[0]?.titleEn).toBe("Show the page");
			expect(retired.modules[0]?.tasks[0]?.status).toBe("retired");
			const stillThere = await database
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.id, taskId));
			expect(stillThere).toHaveLength(1);
		},
		90_000,
	);
});

async function createUser(
	database: NonNullable<typeof suite>["db"],
	label: string,
): Promise<number> {
	const created = await createUserWithPassport(database, {
		email: `${label}-${crypto.randomUUID()}@example.com`,
		name: label,
	});
	return created.userId;
}
