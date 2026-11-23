import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestEnv } from "../../../test/helpers";
import * as schema from "../../db/schema";
import {
	centerStaff,
	contentVersions,
	courses,
	districts,
	enrollments,
	learningCenters,
	modules,
	pointRules,
	pointTransactions,
	provinces,
	roles,
	rubricCriteria,
	sectors,
	tasks,
	userRoles,
} from "../../db/schema";
import { insertUserWithPassport } from "../identity/create-user";
import { createPointCap, createPointRule, listPointStatement } from "./points";
import { createSubmission } from "./submissions";
import { createVerification } from "./verifications";

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

describe("point rules and the statement", () => {
	test("a new rule version is what the award pays, and a cap can reduce it", async () => {
		useTestEnv();
		if (!suite) return;
		const database = suite.db;
		const suffix = crypto.randomUUID().slice(0, 8);
		let actorId = 0;
		try {
			const learnerA = await insertUserWithPassport(database, {
				email: `points-a-${suffix}@example.test`,
				name: "Learner A",
			});
			const learnerB = await insertUserWithPassport(database, {
				email: `points-b-${suffix}@example.test`,
				name: "Learner B",
			});
			const learnerC = await insertUserWithPassport(database, {
				email: `points-c-${suffix}@example.test`,
				name: "Learner C",
			});
			const learnerD = await insertUserWithPassport(database, {
				email: `points-d-${suffix}@example.test`,
				name: "Learner D",
			});
			const trainer = await insertUserWithPassport(database, {
				email: `points-trainer-${suffix}@example.test`,
				name: "Trainer",
			});
			const admin = await insertUserWithPassport(database, {
				email: `points-admin-${suffix}@example.test`,
				name: "Admin",
			});
			actorId = admin.userId;
			const [province] = await database
				.insert(provinces)
				.values({ code: `pp-${suffix}`, name: "Province" })
				.returning({ id: provinces.id });
			const [district] = await database
				.insert(districts)
				.values({
					provinceId: province?.id ?? "",
					code: `pd-${suffix}`,
					name: "District",
				})
				.returning({ id: districts.id });
			const [sector] = await database
				.insert(sectors)
				.values({
					districtId: district?.id ?? "",
					code: `ps-${suffix}`,
					name: "Sector",
				})
				.returning({ id: sectors.id });
			const [center] = await database
				.insert(learningCenters)
				.values({ sectorId: sector?.id ?? "", name: `Points ${suffix}` })
				.returning({ id: learningCenters.id });
			const [course] = await database
				.insert(courses)
				.values({ status: "published", createdByUserId: admin.userId })
				.returning({ id: courses.id });
			const [module] = await database
				.insert(modules)
				.values({
					courseId: course?.id ?? "",
					position: 0,
					status: "published",
				})
				.returning({ id: modules.id });
			const [task] = await database
				.insert(tasks)
				.values({
					moduleId: module?.id ?? "",
					position: 0,
					status: "published",
					evidenceType: "note",
					passThreshold: 60,
					required: true,
				})
				.returning({ id: tasks.id });
			if (!course || !module || !task || !center) {
				throw new Error("fixture was not stored");
			}
			const [criterion] = await database
				.insert(rubricCriteria)
				.values({
					taskId: task.id,
					position: 0,
					weight: 1,
					passThreshold: 60,
					promptEn: "The note names the page.",
					promptRw: "",
				})
				.returning({ id: rubricCriteria.id });
			if (!criterion) throw new Error("rubric was not stored");
			const [version] = await database
				.insert(contentVersions)
				.values({
					courseId: course.id,
					versionNumber: 1,
					publishedByUserId: admin.userId,
					snapshot: {
						titleEn: "Points",
						titleRw: "",
						points: 6,
						modules: [
							{
								id: module.id,
								position: 0,
								titleEn: "Module",
								titleRw: "",
								points: 4,
								requires: [],
								tasks: [
									{
										id: task.id,
										position: 0,
										required: true,
										titleEn: "Note",
										titleRw: "",
										instructionsEn: "",
										instructionsRw: "",
										evidenceType: "note",
										points: 10,
										verifiedMinutes: 30,
										criteria: [],
									},
								],
							},
						],
					},
				})
				.returning({ id: contentVersions.id });
			if (!version) throw new Error("version was not stored");
			const courseId = course.id;
			const versionId = version.id;
			const centerId = center.id;
			const taskId = task.id;
			const criterionId = criterion.id;
			async function enroll(userId: number) {
				const [row] = await database
					.insert(enrollments)
					.values({
						userId,
						courseId,
						contentVersionId: versionId,
						centerId,
					})
					.returning({ id: enrollments.id });
				if (!row) throw new Error("enrollment was not stored");
				return row.id;
			}
			const [role] = await database
				.select({ id: roles.id })
				.from(roles)
				.where(eq(roles.code, "trainer"))
				.limit(1);
			if (!role) throw new Error("trainer role is missing");
			await database.insert(userRoles).values({
				userId: trainer.userId,
				roleId: role.id,
				scopeType: "center",
				scopeId: center.id,
			});
			await database.insert(centerStaff).values({
				centerId: center.id,
				userId: trainer.userId,
				role: "trainer",
			});
			async function approve(
				userId: number,
				enrollmentId: string,
				key: string,
			) {
				const waiting = await createSubmission(database, {
					id: crypto.randomUUID(),
					enrollmentId,
					taskId,
					ownerUserId: userId,
					note: "The page.",
					submit: true,
					ip: "127.0.0.1",
				});
				return createVerification(database, {
					reviewerId: trainer.userId,
					submissionId: waiting.id,
					decision: "approved",
					note: "Approved.",
					scores: [{ criterionId, score: 80 }],
					idempotencyKey: key,
					ip: "127.0.0.1",
				});
			}
			const enrollmentA = await enroll(learnerA.userId);
			const plain = await approve(
				learnerA.userId,
				enrollmentA,
				`plain-${suffix}`,
			);
			expect(plain.points).toBe(20);

			const first = await createPointRule(database, {
				actorId: admin.userId,
				targetType: "task",
				targetId: task.id,
				points: 3,
				weight: 1,
			});
			const second = await createPointRule(database, {
				actorId: admin.userId,
				targetType: "task",
				targetId: task.id,
				points: 3,
				weight: 2,
			});
			expect(first.version).toBe(1);
			expect(second.version).toBe(2);
			const storedRules = await database
				.select({ version: pointRules.version })
				.from(pointRules)
				.where(
					and(
						eq(pointRules.targetType, "task"),
						eq(pointRules.targetId, task.id),
					),
				);
			expect(storedRules).toHaveLength(2);
			await createPointRule(database, {
				actorId: admin.userId,
				targetType: "module",
				targetId: module.id,
				points: 1,
				weight: 1,
			});
			await createPointRule(database, {
				actorId: admin.userId,
				targetType: "course",
				targetId: course.id,
				points: 2,
				weight: 2,
			});
			const enrollmentB = await enroll(learnerB.userId);
			const ruled = await approve(
				learnerB.userId,
				enrollmentB,
				`ruled-${suffix}`,
			);
			expect(ruled.points).toBe(11);
			const ruledRows = await database
				.select({
					amount: pointTransactions.amount,
					kind: pointTransactions.kind,
					ruleId: pointTransactions.ruleId,
					uncappedAmount: pointTransactions.uncappedAmount,
				})
				.from(pointTransactions)
				.where(eq(pointTransactions.userId, learnerB.userId));
			expect(ruledRows).toHaveLength(3);
			expect(ruledRows.every((row) => row.ruleId !== null)).toBe(true);
			expect(ruledRows.reduce((sum, row) => sum + row.amount, 0)).toBe(11);

			await createPointCap(database, {
				actorId: admin.userId,
				dailyCap: 8,
				photoCap: 1000,
				fileCap: 1000,
				noteCap: 1000,
			});
			const enrollmentC = await enroll(learnerC.userId);
			const capped = await approve(
				learnerC.userId,
				enrollmentC,
				`capped-${suffix}`,
			);
			expect(capped.points).toBe(8);
			const cappedRows = await database
				.select({
					amount: pointTransactions.amount,
					kind: pointTransactions.kind,
					uncappedAmount: pointTransactions.uncappedAmount,
				})
				.from(pointTransactions)
				.where(eq(pointTransactions.userId, learnerC.userId));
			const courseRow = cappedRows.find(
				(row) => row.kind === "course_completed",
			);
			expect(courseRow?.amount).toBe(1);
			expect(courseRow?.uncappedAmount).toBe(4);

			await createPointCap(database, {
				actorId: admin.userId,
				dailyCap: 1_000_000,
				photoCap: 1_000_000,
				fileCap: 1_000_000,
				noteCap: 4,
			});
			const enrollmentD = await enroll(learnerD.userId);
			const typed = await approve(
				learnerD.userId,
				enrollmentD,
				`typed-${suffix}`,
			);
			expect(typed.points).toBe(9);
			const typedRows = await database
				.select({
					amount: pointTransactions.amount,
					kind: pointTransactions.kind,
					uncappedAmount: pointTransactions.uncappedAmount,
				})
				.from(pointTransactions)
				.where(eq(pointTransactions.userId, learnerD.userId));
			const taskRow = typedRows.find((row) => row.kind === "task_approved");
			expect(taskRow?.amount).toBe(4);
			expect(taskRow?.uncappedAmount).toBe(6);
			const statement = await listPointStatement(database, learnerD.userId);
			expect(statement.entries).toHaveLength(3);
			expect(statement.balance).toBe(
				statement.entries.reduce((sum, entry) => sum + entry.amount, 0),
			);
			expect(statement.balance).toBe(9);
		} finally {
			if (actorId > 0) {
				await createPointCap(database, {
					actorId,
					dailyCap: 1_000_000,
					photoCap: 1_000_000,
					fileCap: 1_000_000,
					noteCap: 1_000_000,
				});
			}
		}
	}, 120_000);
});
