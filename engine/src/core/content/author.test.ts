import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
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

test("a trainer cannot write a course", () => {
	const denied = decideAccess({
		actorId: "1",
		assignments: [
			{ role: "trainer", scopeType: "center", scopeId: "center-a" },
		],
		permission: "content.write",
		resource: {},
	});
	expect(denied.ok).toBe(false);
	const allowed = decideAccess({
		actorId: "1",
		assignments: [
			{ role: "content_author", scopeType: "global", scopeId: "global" },
		],
		permission: "content.write",
		resource: {},
	});
	expect(allowed.ok).toBe(true);
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

describe.serial("course authoring", () => {
	test.skipIf(suite === null)(
		"a draft needs an evidence type and a rubric, and an empty Kinyarwanda title is flagged",
		async () => {
			if (!suite) return;
			const author = await createUserWithPassport(suite.db, {
				email: `author-${crypto.randomUUID()}@example.com`,
				name: "Author",
			});
			const actor = { actorId: author.userId, ip: "test" };
			const draft = await createCourse(suite.db, {
				...actor,
				titleEn: "Keep a record",
				titleRw: "",
			});
			expect(draft.missingKinyarwanda).toBe(true);
			expect(draft.titleEn).toBe("Keep a record");
			expect(
				await reasonOf(() =>
					submitCourseForReview(suite.db, { ...actor, courseId: draft.id }),
				),
			).toBe("incomplete");

			const withModule = await createModule(suite.db, {
				...actor,
				courseId: draft.id,
				titleEn: "The book",
				titleRw: "Igitabo",
			});
			const moduleId = withModule.modules[0]?.id;
			if (!moduleId) throw new Error("module was not stored");
			const withTask = await createTask(suite.db, {
				...actor,
				moduleId,
				titleEn: "Show the page",
				titleRw: "Erekana paji",
				instructionsEn: "Photograph the page.",
			});
			const taskId = withTask.modules[0]?.tasks[0]?.id;
			if (!taskId) throw new Error("task was not stored");
			expect(
				await reasonOf(() =>
					submitCourseForReview(suite.db, { ...actor, courseId: draft.id }),
				),
			).toBe("incomplete");

			await updateTask(suite.db, {
				...actor,
				taskId,
				titleEn: "Show the page",
				titleRw: "Erekana paji",
				instructionsEn: "Photograph the page.",
				evidenceType: "photo",
			});
			expect(
				await reasonOf(() =>
					submitCourseForReview(suite.db, { ...actor, courseId: draft.id }),
				),
			).toBe("incomplete");

			await createCriterion(suite.db, {
				...actor,
				taskId,
				weight: 1,
				promptEn: "The page is readable.",
			});
			const submitted = await submitCourseForReview(suite.db, {
				...actor,
				courseId: draft.id,
			});
			expect(submitted.status).toBe("in_review");
			expect(submitted.modules[0]?.tasks[0]?.missingKinyarwanda).toBe(true);
			expect(
				await reasonOf(() =>
					updateCourse(suite.db, {
						...actor,
						courseId: draft.id,
						titleEn: "Changed",
					}),
				),
			).toBe("not_draft");
		},
		45_000,
	);
});
