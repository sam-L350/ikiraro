import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import {
	badges,
	contentVersions,
	courses,
	courseTranslations,
	modules,
	moduleTranslations,
	rubricCriteria,
	tasks,
	taskTranslations,
} from "./schema";

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
			"../../.env.local",
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

describe.serial("content schema", () => {
	test.skipIf(suite === null)(
		"a course keeps draft, review, published, and retired, and rejects any other status",
		async () => {
			if (!suite) return;
			const [course] = await suite.db
				.insert(courses)
				.values({ status: "draft" })
				.returning({ id: courses.id });
			if (!course) throw new Error("course was not stored");

			await suite.db.insert(courseTranslations).values([
				{ courseId: course.id, locale: "rw", title: "Kwiga" },
				{ courseId: course.id, locale: "en", title: "Learning" },
			]);
			const [module] = await suite.db
				.insert(modules)
				.values({ courseId: course.id, position: 0, status: "draft" })
				.returning({ id: modules.id });
			if (!module) throw new Error("module was not stored");
			await suite.db.insert(moduleTranslations).values({
				moduleId: module.id,
				locale: "en",
				title: "First module",
			});
			const [task] = await suite.db
				.insert(tasks)
				.values({ moduleId: module.id, position: 0, status: "draft" })
				.returning({ id: tasks.id });
			if (!task) throw new Error("task was not stored");
			await suite.db.insert(taskTranslations).values({
				taskId: task.id,
				locale: "en",
				title: "First task",
				instructions: "Show the record.",
			});
			await suite.db.insert(rubricCriteria).values({
				taskId: task.id,
				position: 0,
				weight: 1,
				promptEn: "The record is complete.",
			});
			await suite.db.insert(badges).values({ courseId: course.id });
			await suite.db.insert(contentVersions).values({
				courseId: course.id,
				versionNumber: 1,
				snapshot: { courseId: course.id, title: "Learning" },
			});

			for (const status of ["in_review", "published", "retired"] as const) {
				await suite.db
					.update(courses)
					.set({ status })
					.where(sql`${courses.id} = ${course.id}`);
			}

			let rejectedStatus = false;
			try {
				await suite.db.execute(
					sql`update courses set status = 'nope' where id = ${course.id}`,
				);
			} catch {
				rejectedStatus = true;
			}
			expect(rejectedStatus).toBe(true);

			let rejectedLocale = false;
			try {
				await suite.db.insert(courseTranslations).values({
					courseId: course.id,
					locale: "en",
					title: "Again",
				});
			} catch {
				rejectedLocale = true;
			}
			expect(rejectedLocale).toBe(true);
		},
		30_000,
	);
});
