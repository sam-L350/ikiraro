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
	badges,
	centerStaff,
	contentVersions,
	courses,
	digitalPassports,
	districts,
	earnedBadges,
	enrollments,
	learningCenters,
	moduleProgress,
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
import { decideAccess } from "../authz/decide";
import { insertUserWithPassport } from "../identity/create-user";
import { readAssignments } from "../identity/staff";
import { reverseAward } from "./reverse";
import { reviewCenters } from "./review-queue";
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

describe("resubmit and reverse_award", () => {
	test("three further attempts are allowed, and the next one is refused", async () => {
		useTestEnv();
		if (!suite) return;
		const database = suite.db;
		const suffix = crypto.randomUUID().slice(0, 8);
		const learner = await insertUserWithPassport(database, {
			email: `retry-learner-${suffix}@example.test`,
			name: "Learner",
		});
		const trainer = await insertUserWithPassport(database, {
			email: `retry-trainer-${suffix}@example.test`,
			name: "Trainer",
		});
		const [province] = await database
			.insert(provinces)
			.values({ code: `rp-${suffix}`, name: "Province" })
			.returning({ id: provinces.id });
		const [district] = await database
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `rd-${suffix}`,
				name: "District",
			})
			.returning({ id: districts.id });
		const [sector] = await database
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `rs-${suffix}`,
				name: "Sector",
			})
			.returning({ id: sectors.id });
		const [center] = await database
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Retry ${suffix}` })
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
		const [version] = await database
			.insert(contentVersions)
			.values({
				courseId: course.id,
				versionNumber: 1,
				publishedByUserId: learner.userId,
				snapshot: {
					titleEn: "Retry",
					titleRw: "",
					points: 0,
					modules: [
						{
							id: module.id,
							position: 0,
							titleEn: "Module",
							titleRw: "",
							points: 0,
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
									points: 0,
									verifiedMinutes: 0,
									criteria: [],
								},
							],
						},
					],
				},
			})
			.returning({ id: contentVersions.id });
		if (!version) throw new Error("version was not stored");
		const [enrollment] = await database
			.insert(enrollments)
			.values({
				userId: learner.userId,
				courseId: course.id,
				contentVersionId: version.id,
				centerId: center.id,
			})
			.returning({ id: enrollments.id });
		if (!enrollment) throw new Error("enrollment was not stored");
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
		const first = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: enrollment.id,
			taskId: task.id,
			ownerUserId: learner.userId,
			note: "First try.",
			submit: true,
			ip: "127.0.0.1",
		});
		await createVerification(database, {
			reviewerId: trainer.userId,
			submissionId: first.id,
			decision: "needs_revision",
			note: "Move closer.",
			ip: "127.0.0.1",
		});
		const second = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: enrollment.id,
			taskId: task.id,
			ownerUserId: learner.userId,
			note: "Second try.",
			submit: true,
			ip: "127.0.0.1",
		});
		expect(second.attempt).toBe(2);
		await createVerification(database, {
			reviewerId: trainer.userId,
			submissionId: second.id,
			decision: "needs_revision",
			note: "Still too far.",
			ip: "127.0.0.1",
		});
		for (const note of ["Third try.", "Fourth try."]) {
			const next = await createSubmission(database, {
				id: crypto.randomUUID(),
				enrollmentId: enrollment.id,
				taskId: task.id,
				ownerUserId: learner.userId,
				note,
				submit: true,
				ip: "127.0.0.1",
			});
			await createVerification(database, {
				reviewerId: trainer.userId,
				submissionId: next.id,
				decision: "needs_revision",
				note: "Change it again.",
				ip: "127.0.0.1",
			});
		}
		const stored = await database
			.select({ id: taskSubmissions.id })
			.from(taskSubmissions)
			.where(eq(taskSubmissions.enrollmentId, enrollment.id));
		try {
			await createSubmission(database, {
				id: crypto.randomUUID(),
				enrollmentId: enrollment.id,
				taskId: task.id,
				ownerUserId: learner.userId,
				note: "Fifth try.",
				submit: true,
				ip: "127.0.0.1",
			});
			throw new Error("expected the next attempt to be refused");
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(409);
			expect(isApiError(error) && error.details).toEqual({ reason: "limit" });
		}
		const after = await database
			.select({ id: taskSubmissions.id })
			.from(taskSubmissions)
			.where(eq(taskSubmissions.enrollmentId, enrollment.id));
		expect(after).toHaveLength(stored.length);
	}, 90_000);

	test("a reversal adds negative rows and a suspended trainer can no longer review", async () => {
		useTestEnv();
		if (!suite) return;
		const database = suite.db;
		const suffix = crypto.randomUUID().slice(0, 8);
		const learner = await insertUserWithPassport(database, {
			email: `reverse-learner-${suffix}@example.test`,
			name: "Learner",
		});
		const trainer = await insertUserWithPassport(database, {
			email: `reverse-trainer-${suffix}@example.test`,
			name: "Trainer",
		});
		const admin = await insertUserWithPassport(database, {
			email: `reverse-admin-${suffix}@example.test`,
			name: "Admin",
		});
		const [province] = await database
			.insert(provinces)
			.values({ code: `vp-${suffix}`, name: "Province" })
			.returning({ id: provinces.id });
		const [district] = await database
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `vd-${suffix}`,
				name: "District",
			})
			.returning({ id: districts.id });
		const [sector] = await database
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `vs-${suffix}`,
				name: "Sector",
			})
			.returning({ id: sectors.id });
		const [center] = await database
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Reverse ${suffix}` })
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
		if (!course || !module || !task || !center || !district) {
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
				titleEn: "Reversal",
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
					titleEn: "Reversal",
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
						titleEn: "Reversal",
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
		const [enrollment] = await database
			.insert(enrollments)
			.values({
				userId: learner.userId,
				courseId: course.id,
				contentVersionId: version.id,
				centerId: center.id,
			})
			.returning({ id: enrollments.id });
		if (!enrollment) throw new Error("enrollment was not stored");
		const roleRows = await database
			.select({ id: roles.id, code: roles.code })
			.from(roles);
		const trainerRole = roleRows.find((row) => row.code === "trainer");
		const adminRole = roleRows.find((row) => row.code === "platform_admin");
		if (!trainerRole || !adminRole) throw new Error("roles are missing");
		await database.insert(userRoles).values([
			{
				userId: trainer.userId,
				roleId: trainerRole.id,
				scopeType: "center",
				scopeId: center.id,
			},
			{
				userId: admin.userId,
				roleId: adminRole.id,
				scopeType: "global",
				scopeId: "global",
			},
		]);
		await database.insert(centerStaff).values({
			centerId: center.id,
			userId: trainer.userId,
			role: "trainer",
		});
		const waiting = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: enrollment.id,
			taskId: task.id,
			ownerUserId: learner.userId,
			note: "The page.",
			submit: true,
			ip: "127.0.0.1",
		});
		const awarded = await createVerification(database, {
			reviewerId: trainer.userId,
			submissionId: waiting.id,
			decision: "approved",
			note: "Approved.",
			scores: [{ criterionId: criterion.id, score: 80 }],
			idempotencyKey: `award-${suffix}`,
			ip: "127.0.0.1",
		});
		const before = await reviewCenters(database, trainer.userId);
		expect(before.some((row) => row.id === center.id)).toBe(true);
		try {
			await reverseAward(database, {
				verificationId: awarded.id,
				actorId: trainer.userId,
				reason: "The photo was not the learner.",
				idempotencyKey: `trainer-${suffix}`,
				suspendReviewer: false,
				ip: "127.0.0.1",
			});
			throw new Error("expected a trainer to be refused");
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(403);
		}
		const key = `reverse-${suffix}`;
		const reversed = await reverseAward(database, {
			verificationId: awarded.id,
			actorId: admin.userId,
			reason: "The photo was not the learner.",
			idempotencyKey: key,
			suspendReviewer: true,
			ip: "127.0.0.1",
		});
		expect(reversed.verificationId).toBe(awarded.id);
		expect(reversed.points).toBe(-20);
		expect(reversed.verifiedMinutes).toBe(90);
		expect(reversed.badgeRevoked).toBe(true);
		expect(reversed.reviewerSuspended).toBe(true);
		const [decision] = await database
			.select({
				decision: submissionVerifications.decision,
			})
			.from(submissionVerifications)
			.where(eq(submissionVerifications.id, awarded.id))
			.limit(1);
		expect(decision?.decision).toBe("approved");
		const [submission] = await database
			.select({ status: taskSubmissions.status })
			.from(taskSubmissions)
			.where(eq(taskSubmissions.id, waiting.id))
			.limit(1);
		expect(submission?.status).toBe("approved");
		const ledger = await database
			.select({
				amount: pointTransactions.amount,
				kind: pointTransactions.kind,
			})
			.from(pointTransactions)
			.where(eq(pointTransactions.verificationId, awarded.id));
		const reversals = ledger.filter((row) => row.kind === "reversal");
		expect(reversals.length).toBeGreaterThan(0);
		expect(reversals.every((row) => row.amount < 0)).toBe(true);
		expect(ledger.reduce((sum, row) => sum + row.amount, 0)).toBe(0);
		const [passport] = await database
			.select({ minutes: digitalPassports.verifiedMinutes })
			.from(digitalPassports)
			.where(eq(digitalPassports.userId, learner.userId))
			.limit(1);
		expect(passport?.minutes).toBe(0);
		const badgesHeld = await database
			.select({ entry: earnedBadges.entry })
			.from(earnedBadges)
			.where(
				and(
					eq(earnedBadges.userId, learner.userId),
					eq(earnedBadges.verificationId, awarded.id),
				),
			);
		expect(badgesHeld.map((row) => row.entry).sort()).toEqual([
			"awarded",
			"revoked",
		]);
		const [progress] = await database
			.select({ status: taskProgress.status })
			.from(taskProgress)
			.where(eq(taskProgress.enrollmentId, enrollment.id))
			.limit(1);
		expect(progress?.status).toBe("started");
		const [moduleRow] = await database
			.select({ status: moduleProgress.status })
			.from(moduleProgress)
			.where(eq(moduleProgress.enrollmentId, enrollment.id))
			.limit(1);
		expect(moduleRow?.status).toBe("started");
		const [suspended] = await database
			.select({ suspendedAt: userRoles.suspendedAt })
			.from(userRoles)
			.where(eq(userRoles.userId, trainer.userId))
			.limit(1);
		expect(suspended?.suspendedAt).toBeInstanceOf(Date);
		const again = await reverseAward(database, {
			verificationId: awarded.id,
			actorId: admin.userId,
			reason: "The photo was not the learner.",
			idempotencyKey: key,
			suspendReviewer: true,
			ip: "127.0.0.1",
		});
		expect(again.id).toBe(reversed.id);
		const afterRetry = await database
			.select({ id: pointTransactions.id })
			.from(pointTransactions)
			.where(eq(pointTransactions.verificationId, awarded.id));
		expect(afterRetry).toHaveLength(ledger.length);
		const assignments = await readAssignments(database, trainer.userId);
		const access = decideAccess({
			actorId: String(trainer.userId),
			assignments,
			permission: "submission.review",
			resource: { centerId: center.id, districtId: district.id },
		});
		expect(access.ok).toBe(false);
		const centers = await reviewCenters(database, trainer.userId);
		expect(centers.some((row) => row.id === center.id)).toBe(false);
		const retried = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: enrollment.id,
			taskId: task.id,
			ownerUserId: learner.userId,
			note: "After the reversal.",
			submit: true,
			ip: "127.0.0.1",
		});
		expect(retried.attempt).toBe(2);
	}, 90_000);
});
