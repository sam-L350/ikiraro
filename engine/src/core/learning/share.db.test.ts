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
	consents,
	contentVersions,
	courses,
	digitalPassports,
	districts,
	enrollments,
	learningCenters,
	mediaObjects,
	modules,
	provinces,
	roles,
	rubricCriteria,
	sectors,
	tasks,
	userRoles,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { insertUserWithPassport } from "../identity/create-user";
import { buildPassportCard } from "./passport-card";
import { createPointCap } from "./points";
import {
	readPublicPassport,
	revokeShareToken,
	rotateShareToken,
	saveShareVisibility,
} from "./share";
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

async function statusOf(run: () => Promise<unknown>): Promise<number> {
	try {
		await run();
		return 200;
	} catch (error) {
		if (!isApiError(error)) throw error;
		return error.status;
	}
}

describe("public passport", () => {
	test("a replaced token is not found, and a minor stays off", async () => {
		useTestEnv();
		if (!suite) return;
		const database = suite.db;
		const suffix = crypto.randomUUID().slice(0, 8);
		const phone = `+25078${suffix}`;
		const village = `Kabeza ${suffix}`;
		const adult = await insertUserWithPassport(database, {
			email: `share-adult-${suffix}@example.test`,
			name: "Aline",
		});
		await database
			.update(users)
			.set({
				dateOfBirth: "2000-01-01",
				phone,
				village,
				picture: "https://images.example.test/aline.jpg",
			})
			.where(eq(users.id, adult.userId));
		expect(
			await statusOf(() =>
				rotateShareToken(database, { userId: adult.userId, ip: "127.0.0.1" }),
			),
		).toBe(400);
		await database.insert(consents).values({
			userId: adult.userId,
			purpose: "public_passport",
			granted: true,
			version: "1",
		});
		const first = await rotateShareToken(database, {
			userId: adult.userId,
			ip: "127.0.0.1",
		});
		const opened = await readPublicPassport(database, first.token);
		expect(opened.name).toBe("Aline");
		expect(opened.photoUrl).toBe("https://images.example.test/aline.jpg");
		expect(opened.phone).toBeNull();
		expect(opened.village).toBeNull();
		expect(JSON.stringify(opened)).not.toContain(phone);
		expect(JSON.stringify(opened)).not.toContain(village);
		await saveShareVisibility(database, {
			userId: adult.userId,
			ip: "127.0.0.1",
			phone: true,
			village: true,
			photo: false,
		});
		const pinned = await readPublicPassport(database, first.token);
		expect(pinned.phone).toBe(phone);
		expect(pinned.village).toBe(village);
		expect(pinned.photoUrl).toBeNull();
		const second = await rotateShareToken(database, {
			userId: adult.userId,
			ip: "127.0.0.1",
		});
		expect(second.token).not.toBe(first.token);
		expect(
			await statusOf(() => readPublicPassport(database, first.token)),
		).toBe(404);
		const card = await buildPassportCard({
			copy: {
				name: "Aline",
				hours: "No verified hours yet.",
				level: "No badge level yet.",
				badges: [],
			},
			url: `http://localhost:5173/p/${second.token}`,
		});
		expect(card.pdfBase64.startsWith("JVBERi")).toBe(true);
		expect(card.imageSvg).toContain("<svg");
		expect(card.imageSvg).toContain("Aline");
		expect(card.imageSvg).not.toContain(phone);
		await database.insert(consents).values({
			userId: adult.userId,
			purpose: "public_passport",
			granted: false,
			version: "1",
			grantedAt: new Date(Date.now() + 60_000),
		});
		expect(
			await statusOf(() => readPublicPassport(database, second.token)),
		).toBe(404);
		await revokeShareToken(database, {
			userId: adult.userId,
			ip: "127.0.0.1",
		});

		const minor = await insertUserWithPassport(database, {
			email: `share-minor-${suffix}@example.test`,
			name: "Keza",
		});
		await database
			.update(users)
			.set({ dateOfBirth: "2015-01-15", phone: `+25079${suffix}` })
			.where(eq(users.id, minor.userId));
		await database.insert(consents).values({
			userId: minor.userId,
			purpose: "public_passport",
			granted: true,
			version: "1",
		});
		const minorToken = `minor${suffix}${"a".repeat(40)}`;
		await database
			.update(digitalPassports)
			.set({ publicShareToken: minorToken })
			.where(eq(digitalPassports.userId, minor.userId));
		expect(await statusOf(() => readPublicPassport(database, minorToken))).toBe(
			404,
		);
		expect(
			await statusOf(() =>
				rotateShareToken(database, { userId: minor.userId, ip: "127.0.0.1" }),
			),
		).toBe(400);
	}, 60_000);

	test("shows the verifier and hides a badge, a phone, and an unpinned photo", async () => {
		useTestEnv();
		if (!suite) return;
		const database = suite.db;
		const suffix = crypto.randomUUID().slice(0, 8);
		const phone = `+25077${suffix}`;
		const learner = await insertUserWithPassport(database, {
			email: `share-learner-${suffix}@example.test`,
			name: "Aline",
		});
		const trainer = await insertUserWithPassport(database, {
			email: `share-trainer-${suffix}@example.test`,
			name: "Mireille",
		});
		await database
			.update(users)
			.set({ dateOfBirth: "1998-04-02", phone, village: "Hidden" })
			.where(eq(users.id, learner.userId));
		await database.insert(consents).values({
			userId: learner.userId,
			purpose: "public_passport",
			granted: true,
			version: "1",
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
			.values({ sectorId: sector?.id ?? "", name: `Gitega ${suffix}` })
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
				evidenceType: "photo",
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
				skillEn: "Can keep a digital sales ledger.",
				skillRw: "Ashobora kubika igitabo.",
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
									titleRw: "Tanga izina",
									instructionsEn: "",
									instructionsRw: "",
									evidenceType: "photo",
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
						skillRw: "Ashobora kubika igitabo.",
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
		const [photo] = await database
			.insert(mediaObjects)
			.values({
				ownerUserId: learner.userId,
				objectKey: `share/${suffix}`,
				contentType: "image/jpeg",
				declaredBytes: 12,
				sha256: "ab".repeat(32),
				status: "ready",
			})
			.returning({ id: mediaObjects.id });
		if (!photo) throw new Error("photo was not stored");
		const photoId = photo.id;
		const waiting = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId,
			taskId,
			ownerUserId: learner.userId,
			mediaId: photoId,
			submit: true,
			ip: "127.0.0.1",
		});
		await createVerification(database, {
			reviewerId: trainer.userId,
			submissionId: waiting.id,
			decision: "approved",
			note: "Approved.",
			scores: [{ criterionId, score: 80 }],
			idempotencyKey: `share-${suffix}`,
			ip: "127.0.0.1",
		});
		const link = await rotateShareToken(database, {
			userId: learner.userId,
			ip: "127.0.0.1",
		});
		const passport = await readPublicPassport(database, link.token);
		expect(passport.phone).toBeNull();
		expect(passport.village).toBeNull();
		expect(passport.evidence).toHaveLength(0);
		expect(passport.centerName).toBe(`Gitega ${suffix}`);
		expect(passport.level).toBe(2);
		expect(passport.badges).toHaveLength(1);
		expect(passport.badges[0]?.skillEn).toBe(
			"Can keep a digital sales ledger.",
		);
		expect(passport.badges[0]?.verifierName).toBe("Mireille");
		expect(passport.badges[0]?.authorityRole).toBe("trainer");
		expect(passport.badges[0]?.centerName).toBe(`Gitega ${suffix}`);
		expect(passport.tasks.map((item) => item.titleEn)).toEqual([
			"Name the page",
		]);
		expect(passport.tasks[0]?.verifierName).toBe("Mireille");
		await saveShareVisibility(database, {
			userId: learner.userId,
			ip: "127.0.0.1",
			hiddenBadges: [badgeId],
			publicEvidence: [photoId],
		});
		const hidden = await readPublicPassport(database, link.token);
		expect(hidden.badges).toHaveLength(0);
		expect(hidden.level).toBeNull();
		expect(hidden.tasks).toHaveLength(1);
		expect(hidden.evidence.map((item) => item.id)).toEqual([photoId]);
		expect(hidden.phone).toBeNull();
		expect(JSON.stringify(hidden)).not.toContain(phone);
	}, 120_000);
});
