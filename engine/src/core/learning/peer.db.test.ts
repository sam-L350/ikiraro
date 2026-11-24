import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	centerStaff,
	contentVersions,
	courses,
	districts,
	enrollments,
	learningCenters,
	modules,
	pointTransactions,
	provinces,
	roles,
	sectors,
	taskSubmissions,
	tasks,
	userRoles,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import {
	addGroupMember,
	answerQuestion,
	askQuestion,
	createGroup,
	createGroupRule,
	createPractice,
	decideAnswer,
	readGroup,
	readPractice,
	readQuestionQueue,
	readQuestions,
	recordCredit,
	submissionCount,
} from "./peer";

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

describe.serial("peer help, group credit, and practice", () => {
	test("a sample does not count, an answer waits for someone else, and credit is per person", async () => {
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

		async function exercise(db: Parameters<typeof createPractice>[0]) {
			const stamp = Date.now().toString(36);
			const author = await createUserWithPassport(db, {
				email: `peer-author-${stamp}@demo.ikiraro.test`,
				name: "Peer author",
			});
			const learner = await createUserWithPassport(db, {
				email: `peer-learner-${stamp}@demo.ikiraro.test`,
				name: "Peer learner",
			});
			const classmate = await createUserWithPassport(db, {
				email: `peer-class-${stamp}@demo.ikiraro.test`,
				name: "Peer classmate",
			});
			const outsider = await createUserWithPassport(db, {
				email: `peer-out-${stamp}@demo.ikiraro.test`,
				name: "Peer outsider",
			});
			const trainerA = await createUserWithPassport(db, {
				email: `peer-trainer-a-${stamp}@demo.ikiraro.test`,
				name: "Trainer A",
			});
			const trainerB = await createUserWithPassport(db, {
				email: `peer-trainer-b-${stamp}@demo.ikiraro.test`,
				name: "Trainer B",
			});
			const [province] = await db
				.insert(provinces)
				.values({ code: `pp-${stamp}`, name: "Peer province" })
				.returning({ id: provinces.id });
			const [district] = await db
				.insert(districts)
				.values({
					provinceId: province?.id ?? "",
					code: `pd-${stamp}`,
					name: "Peer district",
				})
				.returning({ id: districts.id });
			const [sector] = await db
				.insert(sectors)
				.values({
					districtId: district?.id ?? "",
					code: `ps-${stamp}`,
					name: "Peer sector",
				})
				.returning({ id: sectors.id });
			const [center] = await db
				.insert(learningCenters)
				.values({ sectorId: sector?.id ?? "", name: `Peer center ${stamp}` })
				.returning({ id: learningCenters.id });
			const [course] = await db
				.insert(courses)
				.values({ status: "published", createdByUserId: author.userId })
				.returning({ id: courses.id });
			const [module] = await db
				.insert(modules)
				.values({
					courseId: course?.id ?? "",
					status: "published",
					position: 1,
				})
				.returning({ id: modules.id });
			const [task] = await db
				.insert(tasks)
				.values({
					moduleId: module?.id ?? "",
					status: "published",
					position: 1,
				})
				.returning({ id: tasks.id });
			if (!center || !course || !module || !task) {
				throw new Error("The task was not stored.");
			}
			const [version] = await db
				.insert(contentVersions)
				.values({
					courseId: course.id,
					versionNumber: 1,
					snapshot: {
						modules: [
							{
								id: module.id,
								tasks: [{ id: task.id, titleEn: "Count", titleRw: "Bara" }],
							},
						],
					},
				})
				.returning({ id: contentVersions.id });
			if (!version) throw new Error("The version was not stored.");
			await db.insert(enrollments).values([
				{
					userId: learner.userId,
					courseId: course.id,
					contentVersionId: version.id,
					centerId: center.id,
				},
				{
					userId: classmate.userId,
					courseId: course.id,
					contentVersionId: version.id,
					centerId: center.id,
				},
			]);
			const roleRows = await db
				.select({ id: roles.id, code: roles.code })
				.from(roles);
			const roleId = (code: string) => {
				const row = roleRows.find((item) => item.code === code);
				if (!row) throw new Error("A role was not found.");
				return row.id;
			};
			await db.insert(userRoles).values([
				{
					userId: author.userId,
					roleId: roleId("content_author"),
					scopeType: "global",
					scopeId: "global",
				},
				{
					userId: trainerA.userId,
					roleId: roleId("trainer"),
					scopeType: "center",
					scopeId: center.id,
				},
				{
					userId: trainerB.userId,
					roleId: roleId("trainer"),
					scopeType: "center",
					scopeId: center.id,
				},
			]);
			await db.insert(centerStaff).values([
				{ centerId: center.id, userId: trainerA.userId, role: "trainer" },
				{ centerId: center.id, userId: trainerB.userId, role: "trainer" },
			]);

			try {
				await createPractice(db, {
					actorId: author.userId,
					taskId: task.id,
					titleEn: " ",
					titleRw: "Icyitegererezo",
					bodyEn: "A sale",
					bodyRw: "Igurishwa",
					ip: "127.0.0.1",
				});
				throw new Error("expected a blank sample title to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("practice");
			}
			await createPractice(db, {
				actorId: author.userId,
				taskId: task.id,
				titleEn: `Sample ${stamp}`,
				titleRw: `Icyitegererezo ${stamp}`,
				bodyEn: "Count these sales.",
				bodyRw: "Bara ibi byigurishwa.",
				ip: "127.0.0.1",
			});
			const sample = await readPractice(db, learner.userId, task.id);
			expect(sample.sample?.titleEn).toBe(`Sample ${stamp}`);
			expect(await submissionCount(db, learner.userId)).toBe(0);

			try {
				await askQuestion(db, {
					userId: outsider.userId,
					taskId: task.id,
					body: "How?",
					ip: "127.0.0.1",
				});
				throw new Error("expected an outsider to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(403);
				expect(reasonOf(error)).toBe("question");
			}
			const question = await askQuestion(db, {
				userId: learner.userId,
				taskId: task.id,
				body: "Where do I start?",
				ip: "127.0.0.1",
			});
			const open = await readQuestionQueue(db, trainerB.userId);
			expect(
				open.waiting.some(
					(row) => row.questionId === question.id && row.answerId === null,
				),
			).toBe(true);
			try {
				await answerQuestion(db, {
					userId: classmate.userId,
					taskId: task.id,
					questionId: question.id,
					body: "Start with the total.",
					ip: "127.0.0.1",
				});
				throw new Error("expected an unfinished learner to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(403);
				expect(reasonOf(error)).toBe("question");
			}
			await db.insert(taskSubmissions).values({
				id: crypto.randomUUID(),
				enrollmentId:
					(
						await db
							.select({ id: enrollments.id })
							.from(enrollments)
							.where(eq(enrollments.userId, classmate.userId))
							.limit(1)
					)[0]?.id ?? "",
				taskId: task.id,
				contentVersionId: version.id,
				ownerUserId: classmate.userId,
				attempt: 1,
				status: "approved",
				evidenceType: "note",
			});
			const answer = await answerQuestion(db, {
				userId: classmate.userId,
				taskId: task.id,
				questionId: question.id,
				body: "Start with the total.",
				ip: "127.0.0.1",
			});
			const hidden = await readQuestions(db, learner.userId, task.id);
			expect(hidden.questions[0]?.answers).toEqual([]);
			const own = await readQuestions(db, classmate.userId, task.id);
			expect(own.questions[0]?.answers[0]?.status).toBe("pending");
			try {
				await decideAnswer(db, {
					userId: classmate.userId,
					taskId: task.id,
					answerId: answer.id,
					shown: true,
					ip: "127.0.0.1",
				});
				throw new Error("expected the author to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(403);
				expect(reasonOf(error)).toBe("question");
			}
			const shown = await decideAnswer(db, {
				userId: trainerA.userId,
				taskId: task.id,
				answerId: answer.id,
				shown: true,
				ip: "127.0.0.1",
			});
			expect(shown.status).toBe("shown");
			const visible = await readQuestions(db, learner.userId, task.id);
			expect(visible.questions[0]?.answers[0]?.body).toBe(
				"Start with the total.",
			);

			try {
				await createGroup(db, {
					userId: learner.userId,
					taskId: task.id,
					kind: "cooperative",
					name: `Shop ${stamp}`,
					ip: "127.0.0.1",
				});
				throw new Error("expected a task without a rule to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("group");
			}
			try {
				await createGroupRule(db, {
					actorId: author.userId,
					taskId: task.id,
					ruleEn: " ",
					ruleRw: "Buri muntu yandika icyo yakoze.",
					ip: "127.0.0.1",
				});
				throw new Error("expected a blank rule to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("group");
			}
			await createGroupRule(db, {
				actorId: author.userId,
				taskId: task.id,
				ruleEn: "Each person writes what they did.",
				ruleRw: "Buri muntu yandika icyo yakoze.",
				ip: "127.0.0.1",
			});
			try {
				await createGroup(db, {
					userId: learner.userId,
					taskId: task.id,
					kind: "shop",
					name: `Shop ${stamp}`,
					ip: "127.0.0.1",
				});
				throw new Error("expected an unknown kind to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("group");
			}
			const group = await createGroup(db, {
				userId: learner.userId,
				taskId: task.id,
				kind: "cooperative",
				name: `Shop ${stamp}`,
				ip: "127.0.0.1",
			});
			try {
				await createGroup(db, {
					userId: learner.userId,
					taskId: task.id,
					kind: "family",
					name: `Home ${stamp}`,
					ip: "127.0.0.1",
				});
				throw new Error("expected a second group to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(409);
				expect(reasonOf(error)).toBe("group");
			}
			try {
				await addGroupMember(db, {
					actorId: learner.userId,
					taskId: task.id,
					groupId: group.id,
					userId: outsider.userId,
					ip: "127.0.0.1",
				});
				throw new Error("expected an outsider to stay out of the group");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("group");
			}
			await addGroupMember(db, {
				actorId: learner.userId,
				taskId: task.id,
				groupId: group.id,
				userId: classmate.userId,
				ip: "127.0.0.1",
			});
			await recordCredit(db, {
				userId: learner.userId,
				taskId: task.id,
				groupId: group.id,
				body: "I counted the morning sales.",
				ip: "127.0.0.1",
			});
			const table = await readGroup(db, learner.userId, task.id);
			const mine = table.groups.find((item) => item.id === group.id);
			expect(mine?.members.find((member) => member.mine)?.did).toBe(
				"I counted the morning sales.",
			);
			expect(await submissionCount(db, learner.userId)).toBe(0);
			const [points] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(pointTransactions)
				.where(eq(pointTransactions.userId, learner.userId));
			expect(Number(points?.count ?? 0)).toBe(0);
		}
	}, 120_000);
});
