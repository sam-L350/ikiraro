import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestEnv } from "../../../test/helpers";
import * as schema from "../../db/schema";
import {
	badges,
	centerStaff,
	contentVersions,
	courses,
	digitalPassports,
	districts,
	domainEvents,
	earnedBadges,
	enrollments,
	learningCenters,
	modules,
	pointTransactions,
	provinces,
	roles,
	rubricCriteria,
	sectors,
	submissionVerifications,
	taskProgress,
	taskSubmissions,
	tasks,
	userRoles,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { insertUserWithPassport } from "../identity/create-user";
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

function errorText(error: unknown): string {
	if (error instanceof Error)
		return `${error.message} ${errorText(error.cause)}`;
	return "";
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe("award_submission", () => {
	test("approval writes the pass, points, hours, and badge together, and a retry does not add points", async () => {
		useTestEnv();
		if (!suite) return;
		const database = suite.db;
		const suffix = crypto.randomUUID().slice(0, 8);
		const learner = await insertUserWithPassport(database, {
			email: `award-learner-${suffix}@example.test`,
			name: "Learner",
		});
		const halted = await insertUserWithPassport(database, {
			email: `award-halted-${suffix}@example.test`,
			name: "Halted",
		});
		const trainer = await insertUserWithPassport(database, {
			email: `award-trainer-${suffix}@example.test`,
			name: "Trainer",
		});
		const [province] = await database
			.insert(provinces)
			.values({ code: `ap-${suffix}`, name: "Province" })
			.returning({ id: provinces.id });
		const [district] = await database
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `ad-${suffix}`,
				name: "District",
			})
			.returning({ id: districts.id });
		const [sector] = await database
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `as-${suffix}`,
				name: "Sector",
			})
			.returning({ id: sectors.id });
		const [center] = await database
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Award ${suffix}` })
			.returning({ id: learningCenters.id });
		const [course] = await database
			.insert(courses)
			.values({ status: "published", createdByUserId: learner.userId })
			.returning({ id: courses.id });
		const [module] = await database
			.insert(modules)
			.values({ courseId: course?.id ?? "", position: 0, status: "published" })
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
		const [badge] = await database
			.insert(badges)
			.values({
				courseId: course.id,
				titleEn: "Ledger",
				level: 1,
				rule: {
					allRequiredTasksApproved: true,
					minimumScore: null,
					minimumHours: null,
				},
			})
			.returning({ id: badges.id });
		if (!criterion || !badge) throw new Error("rubric was not stored");
		const [version] = await database
			.insert(contentVersions)
			.values({
				courseId: course.id,
				versionNumber: 1,
				publishedByUserId: learner.userId,
				snapshot: {
					titleEn: "Ledger",
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
									verifiedMinutes: 90,
									criteria: [],
								},
							],
						},
					],
					badge: {
						id: badge.id,
						titleEn: "Ledger",
						titleRw: "",
						level: 1,
						rule: {
							allRequiredTasksApproved: true,
							minimumScore: null,
							minimumHours: null,
						},
					},
				},
			})
			.returning({ id: contentVersions.id });
		if (!version) throw new Error("version was not stored");
		const courseId = course.id;
		const versionId = version.id;
		const centerId = center.id;
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
		const learnerEnrollment = await enroll(learner.userId);
		const haltedEnrollment = await enroll(halted.userId);
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
		const waiting = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: learnerEnrollment,
			taskId: task.id,
			ownerUserId: learner.userId,
			note: "The page.",
			submit: true,
			ip: "127.0.0.1",
		});
		const blocked = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: haltedEnrollment,
			taskId: task.id,
			ownerUserId: halted.userId,
			note: "Another page.",
			submit: true,
			ip: "127.0.0.1",
		});
		const key = `award-${suffix}`;
		const awarded = await createVerification(database, {
			reviewerId: trainer.userId,
			submissionId: waiting.id,
			decision: "approved",
			note: "Approved.",
			scores: [{ criterionId: criterion.id, score: 80 }],
			idempotencyKey: key,
			ip: "127.0.0.1",
		});
		expect(awarded.decision).toBe("approved");
		expect(awarded.scoreTotal).toBe(80);
		expect(awarded.points).toBe(20);
		expect(awarded.verifiedMinutes).toBe(90);
		expect(awarded.badgeId).toBe(badge.id);
		const [stored] = await database
			.select({ status: taskSubmissions.status })
			.from(taskSubmissions)
			.where(eq(taskSubmissions.id, waiting.id))
			.limit(1);
		expect(stored?.status).toBe("approved");
		const [progress] = await database
			.select({ status: taskProgress.status })
			.from(taskProgress)
			.where(eq(taskProgress.enrollmentId, learnerEnrollment))
			.limit(1);
		expect(progress?.status).toBe("complete");
		const [passport] = await database
			.select({ minutes: digitalPassports.verifiedMinutes })
			.from(digitalPassports)
			.where(eq(digitalPassports.userId, learner.userId))
			.limit(1);
		expect(passport?.minutes).toBe(90);
		const ledger = await database
			.select({
				amount: pointTransactions.amount,
				kind: pointTransactions.kind,
			})
			.from(pointTransactions)
			.where(eq(pointTransactions.userId, learner.userId));
		expect(ledger).toHaveLength(3);
		expect(ledger.reduce((sum, row) => sum + row.amount, 0)).toBe(20);
		const [badgeRow] = await database
			.select({ entry: earnedBadges.entry })
			.from(earnedBadges)
			.where(eq(earnedBadges.userId, learner.userId))
			.limit(1);
		expect(badgeRow?.entry).toBe("awarded");
		const events = await database
			.select({ name: domainEvents.name })
			.from(domainEvents)
			.where(sql`${domainEvents.payload}->>'verificationId' = ${awarded.id}`);
		expect(events.map((row) => row.name).sort()).toEqual([
			"badge.awarded",
			"submission.approved",
		]);

		const again = await createVerification(database, {
			reviewerId: trainer.userId,
			submissionId: waiting.id,
			decision: "approved",
			note: "Approved.",
			scores: [{ criterionId: criterion.id, score: 80 }],
			idempotencyKey: key,
			ip: "127.0.0.1",
		});
		expect(again.id).toBe(awarded.id);
		const afterRetry = await database
			.select({ id: pointTransactions.id })
			.from(pointTransactions)
			.where(eq(pointTransactions.userId, learner.userId));
		expect(afterRetry).toHaveLength(3);

		let thrown: unknown;
		try {
			await database.execute(
				sql`update point_transactions set amount = 0 where user_id = ${learner.userId}`,
			);
		} catch (error) {
			thrown = error;
		}
		expect(errorText(thrown)).toContain("append-only");

		try {
			await createVerification(database, {
				reviewerId: trainer.userId,
				submissionId: blocked.id,
				decision: "approved",
				note: "Approved.",
				scores: [{ criterionId: criterion.id, score: 40 }],
				idempotencyKey: `low-${suffix}`,
				ip: "127.0.0.1",
			});
			throw new Error("expected a low score to be refused");
		} catch (error) {
			expect(isApiError(error) && error.details).toEqual({
				reason: "threshold",
			});
		}
		const [stillWaiting] = await database
			.select({ status: taskSubmissions.status })
			.from(taskSubmissions)
			.where(eq(taskSubmissions.id, blocked.id))
			.limit(1);
		expect(stillWaiting?.status).toBe("pending");

		await database
			.delete(digitalPassports)
			.where(eq(digitalPassports.userId, halted.userId));
		try {
			await createVerification(database, {
				reviewerId: trainer.userId,
				submissionId: blocked.id,
				decision: "approved",
				note: "Approved.",
				scores: [{ criterionId: criterion.id, score: 80 }],
				idempotencyKey: `halt-${suffix}`,
				ip: "127.0.0.1",
			});
			throw new Error("expected a missing passport to abort the award");
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(500);
		}
		const [untouched] = await database
			.select({ status: taskSubmissions.status })
			.from(taskSubmissions)
			.where(eq(taskSubmissions.id, blocked.id))
			.limit(1);
		expect(untouched?.status).toBe("pending");
		const haltedPoints = await database
			.select({ id: pointTransactions.id })
			.from(pointTransactions)
			.where(eq(pointTransactions.userId, halted.userId));
		expect(haltedPoints).toHaveLength(0);
		const haltedChecks = await database
			.select({ id: submissionVerifications.id })
			.from(submissionVerifications)
			.where(eq(submissionVerifications.submissionId, blocked.id));
		expect(haltedChecks).toHaveLength(0);
	}, 90_000);
});
