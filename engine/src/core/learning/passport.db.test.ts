import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestEnv } from "../../../test/helpers";
import * as schema from "../../db/schema";
import {
	badges,
	centerStaff,
	contentVersions,
	courses,
	districts,
	earnedBadges,
	enrollments,
	learningCenters,
	modules,
	provinces,
	roles,
	rubricCriteria,
	sectors,
	tasks,
	userRoles,
} from "../../db/schema";
import { insertUserWithPassport } from "../identity/create-user";
import { readPassport } from "./passport";
import { createPointCap } from "./points";
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

describe("learner passport", () => {
	test("shows hours, points, the pinned skill, and hides a revoked badge", async () => {
		useTestEnv();
		if (!suite) return;
		const database = suite.db;
		const suffix = crypto.randomUUID().slice(0, 8);
		const learner = await insertUserWithPassport(database, {
			email: `passport-learner-${suffix}@example.test`,
			name: "Learner",
		});
		const trainer = await insertUserWithPassport(database, {
			email: `passport-trainer-${suffix}@example.test`,
			name: "Trainer",
		});
		const [province] = await database
			.insert(provinces)
			.values({ code: `sp-${suffix}`, name: "Province" })
			.returning({ id: provinces.id });
		const [district] = await database
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `sd-${suffix}`,
				name: "District",
			})
			.returning({ id: districts.id });
		const [sector] = await database
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `ss-${suffix}`,
				name: "Sector",
			})
			.returning({ id: sectors.id });
		const [center] = await database
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Passport ${suffix}` })
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
				titleRw: "Igitabo",
				skillEn: "A later draft.",
				skillRw: "Inyandiko y'inyuma.",
				level: 2,
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
					titleRw: "Igitabo",
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
									titleEn: "Name the page",
									titleRw: "Tanga izina ry'ipaji",
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
						titleRw: "Igitabo",
						skillEn: "Can keep a digital sales ledger.",
						skillRw: "Ashobora kubika igitabo cy'ibicuruzwa.",
						level: 2,
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
		const taskId = task.id;
		const criterionId = criterion.id;
		const badgeId = badge.id;
		const [enrollment] = await database
			.insert(enrollments)
			.values({
				userId: learner.userId,
				courseId,
				contentVersionId: versionId,
				centerId,
			})
			.returning({ id: enrollments.id });
		if (!enrollment) throw new Error("enrollment was not stored");
		const enrollmentId = enrollment.id;
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
			scopeId: centerId,
		});
		await database.insert(centerStaff).values({
			centerId,
			userId: trainer.userId,
			role: "trainer",
		});
		await createPointCap(database, {
			actorId: learner.userId,
			dailyCap: 1_000_000,
			photoCap: 1_000_000,
			fileCap: 1_000_000,
			noteCap: 1_000_000,
		});
		const waiting = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId,
			taskId,
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
			scores: [{ criterionId, score: 80 }],
			idempotencyKey: `passport-${suffix}`,
			ip: "127.0.0.1",
		});
		const passport = await readPassport(database, learner.userId);
		expect(passport.verifiedMinutes).toBe(90);
		expect(passport.hours).toBe(1);
		expect(passport.points).toBe(20);
		expect(passport.level).toBe(2);
		expect(passport.badges).toHaveLength(1);
		expect(passport.badges[0]?.skillEn).toBe(
			"Can keep a digital sales ledger.",
		);
		expect(passport.badges[0]?.skillRw).toBe(
			"Ashobora kubika igitabo cy'ibicuruzwa.",
		);
		expect(passport.badges[0]?.titleEn).toBe("Ledger");
		expect(passport.tasks.map((item) => item.titleEn)).toEqual([
			"Name the page",
		]);

		await database.insert(earnedBadges).values({
			userId: learner.userId,
			badgeId,
			enrollmentId,
			verificationId: awarded.id,
			entry: "revoked",
		});
		const after = await readPassport(database, learner.userId);
		expect(after.badges).toHaveLength(0);
		expect(after.level).toBeNull();
		expect(after.tasks).toHaveLength(1);
		expect(after.points).toBe(20);
	}, 90_000);
});
