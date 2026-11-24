import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	courses,
	courseTranslations,
	pointTransactions,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import {
	answerPlacement,
	createPathway,
	createPlacementQuestion,
	readPathways,
	readPlacementQuestions,
	suggestedCourseId,
} from "./pathways";

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

function reasonOf(error: unknown): string {
	if (isApiError(error)) {
		const details = error.details;
		if (details && typeof details === "object" && "reason" in details) {
			return String(details.reason);
		}
	}
	return "";
}

function statusOf(error: unknown): number {
	return isApiError(error) ? error.status : 0;
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe.serial("pathways and placement", () => {
	test("the next course is the first one not finished, and the check suggests one course", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const root = suite.db;
		try {
			await root.transaction(async (db) => {
				await exercise(db);
				throw new Error("rollback");
			});
		} catch (error) {
			if (!(error instanceof Error) || error.message !== "rollback")
				throw error;
		}

		async function exercise(db: NonNullable<typeof suite>["db"]) {
			const stamp = Date.now().toString(36);
			const author = await createUserWithPassport(db, {
				email: `path-author-${stamp}@demo.ikiraro.test`,
				name: "Path author",
			});
			const learner = await createUserWithPassport(db, {
				email: `path-learner-${stamp}@demo.ikiraro.test`,
				name: "Path learner",
			});
			const [first, second, draft] = await db
				.insert(courses)
				.values([
					{ status: "published", createdByUserId: author.userId },
					{ status: "published", createdByUserId: author.userId },
					{ status: "draft", createdByUserId: author.userId },
				])
				.returning({ id: courses.id });
			if (!first || !second || !draft)
				throw new Error("The courses were not stored.");
			await db.insert(courseTranslations).values([
				{ courseId: first.id, locale: "en", title: `Shop ${stamp}` },
				{ courseId: first.id, locale: "rw", title: `Iduka ${stamp}` },
				{ courseId: second.id, locale: "en", title: `Season ${stamp}` },
				{ courseId: second.id, locale: "rw", title: `Igihembwe ${stamp}` },
			]);
			try {
				await createPathway(db, {
					actorId: author.userId,
					titleEn: `Run a shop ${stamp}`,
					titleRw: `Koresha iduka ${stamp}`,
					courseIds: [first.id],
					ip: "127.0.0.1",
				});
				throw new Error("expected one course to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("pathway");
			}
			try {
				await createPathway(db, {
					actorId: author.userId,
					titleEn: `Run a shop ${stamp}`,
					titleRw: `Koresha iduka ${stamp}`,
					courseIds: [first.id, draft.id],
					ip: "127.0.0.1",
				});
				throw new Error("expected a draft course to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("course");
			}
			try {
				await createPathway(db, {
					actorId: author.userId,
					titleEn: " ",
					titleRw: `Koresha iduka ${stamp}`,
					courseIds: [first.id, second.id],
					ip: "127.0.0.1",
				});
				throw new Error("expected a blank title to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("pathway");
			}
			try {
				await createPathway(db, {
					actorId: author.userId,
					titleEn: `Run a shop ${stamp}`,
					titleRw: `Koresha iduka ${stamp}`,
					courseIds: [first.id, first.id],
					ip: "127.0.0.1",
				});
				throw new Error("expected a repeated course to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("pathway");
			}
			await createPathway(db, {
				actorId: author.userId,
				titleEn: `Run a shop ${stamp}`,
				titleRw: `Koresha iduka ${stamp}`,
				courseIds: [first.id, second.id],
				ip: "127.0.0.1",
			});
			const before = await readPathways(db, learner.userId, false);
			const pathway = before.pathways.find((item) =>
				item.titleEn.includes(stamp),
			);
			expect(pathway?.courses.map((course) => course.id)).toEqual([
				first.id,
				second.id,
			]);
			expect(pathway?.nextCourseId).toBe(first.id);
			await db.insert(pointTransactions).values({
				userId: learner.userId,
				amount: 0,
				kind: "course_completed",
				referenceType: "course",
				referenceId: first.id,
			});
			const after = await readPathways(db, learner.userId, false);
			const moved = after.pathways.find((item) => item.titleEn.includes(stamp));
			expect(moved?.nextCourseId).toBe(second.id);
			expect(moved?.courses[0]?.finished).toBe(true);

			const opening = await createPlacementQuestion(db, {
				actorId: author.userId,
				promptEn: `What can you do ${stamp}`,
				promptRw: `Wakoriki ${stamp}`,
				choices: [
					{
						labelEn: "Count a sale",
						labelRw: "Bara igurishwa",
						courseId: first.id,
					},
					{
						labelEn: "Plan a field",
						labelRw: "Tegura umurima",
						courseId: second.id,
					},
				],
				ip: "127.0.0.1",
			});
			const later = await createPlacementQuestion(db, {
				actorId: author.userId,
				promptEn: `What is next ${stamp}`,
				promptRw: `Ikurikira ${stamp}`,
				choices: [
					{ labelEn: "The shop", labelRw: "Iduka", courseId: first.id },
					{ labelEn: "The season", labelRw: "Igihembwe", courseId: second.id },
				],
				ip: "127.0.0.1",
			});
			expect(opening.id).not.toBe(later.id);
			const published = await readPlacementQuestions(db);
			const mine = published.questions.filter((question) =>
				question.promptEn.includes(stamp),
			);
			expect(mine).toHaveLength(2);
			const shopTwice = mine.map(
				(question) =>
					question.choices.find((choice) => choice.courseId === first.id)?.id ??
					"",
			);
			expect(suggestedCourseId(mine, shopTwice)).toBe(first.id);
			const split = [
				mine[0]?.choices.find((choice) => choice.courseId === second.id)?.id ??
					"",
				mine[1]?.choices.find((choice) => choice.courseId === first.id)?.id ??
					"",
			];
			expect(suggestedCourseId(mine, split)).toBe(second.id);
			try {
				await answerPlacement(db, {
					userId: learner.userId,
					choiceIds: shopTwice.slice(0, 1),
					ip: "127.0.0.1",
				});
				throw new Error("expected a partial check to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("placement");
			}
			const choiceIds = published.questions.map((question) => {
				const preferred = question.choices.find(
					(choice) => choice.courseId === first.id,
				);
				return preferred?.id ?? question.choices[0]?.id ?? "";
			});
			const stored = await answerPlacement(db, {
				userId: learner.userId,
				choiceIds,
				ip: "127.0.0.1",
			});
			expect(stored.courseId).toBe(
				suggestedCourseId(published.questions, choiceIds),
			);
			try {
				await answerPlacement(db, {
					userId: learner.userId,
					choiceIds: shopTwice,
					ip: "127.0.0.1",
				});
				throw new Error("expected a second check to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(409);
				expect(reasonOf(error)).toBe("placement");
			}
		}
	}, 120_000);
});
