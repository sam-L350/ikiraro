import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	centerStaff,
	contentVersions,
	courses,
	districts,
	enrollments,
	inPersonChecks,
	learningCenters,
	mediaObjects,
	modules,
	provinces,
	roles,
	sectors,
	taskSubmissions,
	tasks,
	userRoles,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
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

function hash(): string {
	return (
		crypto.randomUUID().replaceAll("-", "") +
		crypto.randomUUID().replaceAll("-", "")
	);
}

describe.serial("evidence integrity", () => {
	test("the same file is flagged, including when another learner sent it", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const learner = await createUserWithPassport(db, {
			email: `hash-${stamp}-a@demo.ikiraro.test`,
			name: "Hash learner A",
		});
		const other = await createUserWithPassport(db, {
			email: `hash-${stamp}-b@demo.ikiraro.test`,
			name: "Hash learner B",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `hp-${stamp}`, name: "Hash province" })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `hd-${stamp}`,
				name: "Hash district",
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `hs-${stamp}`,
				name: "Hash sector",
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Hash center ${stamp}` })
			.returning({ id: learningCenters.id });
		const [course] = await db
			.insert(courses)
			.values({ status: "published", createdByUserId: learner.userId })
			.returning({ id: courses.id });
		const [module] = await db
			.insert(modules)
			.values({ courseId: course?.id ?? "", position: 0, status: "published" })
			.returning({ id: modules.id });
		const [firstTask] = await db
			.insert(tasks)
			.values({
				moduleId: module?.id ?? "",
				position: 0,
				status: "published",
				evidenceType: "photo",
			})
			.returning({ id: tasks.id });
		const [secondTask] = await db
			.insert(tasks)
			.values({
				moduleId: module?.id ?? "",
				position: 1,
				status: "published",
				evidenceType: "photo",
			})
			.returning({ id: tasks.id });
		if (!center || !course || !module || !firstTask || !secondTask) {
			throw new Error("The hash fixture was not stored.");
		}
		const centerId = center.id;
		const courseId = course.id;
		const [version] = await db
			.insert(contentVersions)
			.values({
				courseId: course.id,
				versionNumber: 1,
				snapshot: {
					titleEn: "Hash",
					modules: [
						{
							id: module.id,
							position: 0,
							requires: [],
							tasks: [
								{
									id: firstTask.id,
									position: 0,
									required: true,
									evidenceType: "photo",
									titleEn: "First",
								},
								{
									id: secondTask.id,
									position: 1,
									required: true,
									evidenceType: "photo",
									titleEn: "Second",
								},
							],
						},
					],
				},
			})
			.returning({ id: contentVersions.id });
		if (!version) throw new Error("The hash version was not stored.");
		const versionId = version.id;
		async function enroll(userId: number) {
			const [row] = await db
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
		const shared = hash();
		async function photo(ownerUserId: number, digest: string) {
			const [row] = await db
				.insert(mediaObjects)
				.values({
					ownerUserId,
					objectKey: `evidence/${crypto.randomUUID()}`,
					contentType: "image/jpeg",
					declaredBytes: 4,
					sizeBytes: 4,
					sha256: digest,
					status: "ready",
					finalizedAt: new Date(),
				})
				.returning({ id: mediaObjects.id });
			if (!row) throw new Error("media was not stored");
			return row.id;
		}
		const first = await createSubmission(db, {
			id: crypto.randomUUID(),
			enrollmentId: await enroll(learner.userId),
			taskId: firstTask.id,
			ownerUserId: learner.userId,
			mediaId: await photo(learner.userId, shared),
			submit: true,
			ip: "127.0.0.1",
		});
		expect(first.duplicate).toBe("none");
		const again = await createSubmission(db, {
			id: crypto.randomUUID(),
			enrollmentId: first.enrollmentId,
			taskId: secondTask.id,
			ownerUserId: learner.userId,
			mediaId: await photo(learner.userId, shared),
			submit: true,
			ip: "127.0.0.1",
		});
		expect(again.duplicate).toBe("same");
		const reused = await createSubmission(db, {
			id: crypto.randomUUID(),
			enrollmentId: await enroll(other.userId),
			taskId: firstTask.id,
			ownerUserId: other.userId,
			mediaId: await photo(other.userId, shared),
			submit: true,
			ip: "127.0.0.1",
		});
		expect(reused.duplicate).toBe("other");
		const rows = await db
			.select({
				id: taskSubmissions.id,
				duplicateKind: taskSubmissions.duplicateKind,
			})
			.from(taskSubmissions)
			.where(eq(taskSubmissions.contentHash, shared));
		expect(rows.map((row) => row.duplicateKind).sort()).toEqual([
			"other",
			"other",
			"other",
		]);
	});

	test("a badge that asks for a visit stores the place and the time, and a future time does not", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const learner = await createUserWithPassport(db, {
			email: `visit-${stamp}-learner@demo.ikiraro.test`,
			name: "Visit learner",
		});
		const trainer = await createUserWithPassport(db, {
			email: `visit-${stamp}-trainer@demo.ikiraro.test`,
			name: "Visit trainer",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `vp-${stamp}`, name: "Visit province" })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `vd-${stamp}`,
				name: "Visit district",
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `vs-${stamp}`,
				name: "Visit sector",
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Visit center ${stamp}` })
			.returning({ id: learningCenters.id });
		const [course] = await db
			.insert(courses)
			.values({ status: "published", createdByUserId: learner.userId })
			.returning({ id: courses.id });
		const [plainCourse] = await db
			.insert(courses)
			.values({ status: "published", createdByUserId: learner.userId })
			.returning({ id: courses.id });
		const [module] = await db
			.insert(modules)
			.values({ courseId: course?.id ?? "", position: 0, status: "published" })
			.returning({ id: modules.id });
		const [plainModule] = await db
			.insert(modules)
			.values({
				courseId: plainCourse?.id ?? "",
				position: 0,
				status: "published",
			})
			.returning({ id: modules.id });
		const [task] = await db
			.insert(tasks)
			.values({
				moduleId: module?.id ?? "",
				position: 0,
				status: "published",
				evidenceType: "note",
			})
			.returning({ id: tasks.id });
		const [plainTask] = await db
			.insert(tasks)
			.values({
				moduleId: plainModule?.id ?? "",
				position: 0,
				status: "published",
				evidenceType: "note",
			})
			.returning({ id: tasks.id });
		if (
			!center ||
			!course ||
			!plainCourse ||
			!module ||
			!plainModule ||
			!task ||
			!plainTask
		) {
			throw new Error("The visit fixture was not stored.");
		}
		function snapshot(
			moduleId: string,
			taskId: string,
			requiresInPerson: boolean,
		) {
			return {
				titleEn: "Visit",
				modules: [
					{
						id: moduleId,
						position: 0,
						requires: [],
						tasks: [
							{
								id: taskId,
								position: 0,
								required: true,
								evidenceType: "note",
								titleEn: "Note",
							},
						],
					},
				],
				badge: { requiresInPerson },
			};
		}
		const [version] = await db
			.insert(contentVersions)
			.values({
				courseId: course.id,
				versionNumber: 1,
				snapshot: snapshot(module.id, task.id, true),
			})
			.returning({ id: contentVersions.id });
		const [plainVersion] = await db
			.insert(contentVersions)
			.values({
				courseId: plainCourse.id,
				versionNumber: 1,
				snapshot: snapshot(plainModule.id, plainTask.id, false),
			})
			.returning({ id: contentVersions.id });
		if (!version || !plainVersion) throw new Error("version was not stored");
		const [enrollment] = await db
			.insert(enrollments)
			.values({
				userId: learner.userId,
				courseId: course.id,
				contentVersionId: version.id,
				centerId: center.id,
			})
			.returning({ id: enrollments.id });
		const [plainEnrollment] = await db
			.insert(enrollments)
			.values({
				userId: learner.userId,
				courseId: plainCourse.id,
				contentVersionId: plainVersion.id,
				centerId: center.id,
			})
			.returning({ id: enrollments.id });
		if (!enrollment || !plainEnrollment) {
			throw new Error("enrollment was not stored");
		}
		const [role] = await db
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.code, "trainer"))
			.limit(1);
		if (!role) throw new Error("trainer role was not found");
		await db.insert(userRoles).values({
			userId: trainer.userId,
			roleId: role.id,
			scopeType: "center",
			scopeId: center.id,
		});
		await db.insert(centerStaff).values({
			centerId: center.id,
			userId: trainer.userId,
			role: "trainer",
		});
		const waiting = await createSubmission(db, {
			id: crypto.randomUUID(),
			enrollmentId: enrollment.id,
			taskId: task.id,
			ownerUserId: learner.userId,
			note: "I counted the stock.",
			submit: true,
			ip: "127.0.0.1",
		});
		try {
			await createVerification(db, {
				reviewerId: trainer.userId,
				submissionId: waiting.id,
				decision: "approved",
				note: "Seen.",
				idempotencyKey: crypto.randomUUID(),
				ip: "127.0.0.1",
			});
			throw new Error("expected the visit to be required");
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(400);
			expect(isApiError(error) && error.details).toEqual({
				reason: "in_person",
			});
		}
		const [stillWaiting] = await db
			.select({ status: taskSubmissions.status })
			.from(taskSubmissions)
			.where(eq(taskSubmissions.id, waiting.id))
			.limit(1);
		expect(stillWaiting?.status).toBe("pending");
		try {
			await createVerification(db, {
				reviewerId: trainer.userId,
				submissionId: waiting.id,
				decision: "approved",
				note: "Seen.",
				inPerson: {
					location: "Visit center",
					observedAt: new Date(Date.now() + 10 * 60_000).toISOString(),
				},
				idempotencyKey: crypto.randomUUID(),
				ip: "127.0.0.1",
			});
			throw new Error("expected a future time to be refused");
		} catch (error) {
			expect(isApiError(error) && error.details).toEqual({
				reason: "observed",
			});
		}
		const observedAt = new Date(Date.now() - 60_000);
		const approved = await createVerification(db, {
			reviewerId: trainer.userId,
			submissionId: waiting.id,
			decision: "approved",
			note: "Seen in the room.",
			inPerson: {
				location: "Visit center",
				observedAt: observedAt.toISOString(),
			},
			idempotencyKey: crypto.randomUUID(),
			ip: "127.0.0.1",
		});
		const [check] = await db
			.select({
				location: inPersonChecks.location,
				observedAt: inPersonChecks.observedAt,
				submissionId: inPersonChecks.submissionId,
			})
			.from(inPersonChecks)
			.where(eq(inPersonChecks.verificationId, approved.id))
			.limit(1);
		expect(check?.location).toBe("Visit center");
		expect(check?.submissionId).toBe(waiting.id);
		expect(check?.observedAt?.toISOString()).toBe(observedAt.toISOString());
		const plain = await createSubmission(db, {
			id: crypto.randomUUID(),
			enrollmentId: plainEnrollment.id,
			taskId: plainTask.id,
			ownerUserId: learner.userId,
			note: "A note that does not need a visit.",
			submit: true,
			ip: "127.0.0.1",
		});
		try {
			await createVerification(db, {
				reviewerId: trainer.userId,
				submissionId: plain.id,
				decision: "approved",
				note: "Approved.",
				inPerson: {
					location: "Visit center",
					observedAt: observedAt.toISOString(),
				},
				idempotencyKey: crypto.randomUUID(),
				ip: "127.0.0.1",
			});
			throw new Error("expected an unasked visit to be refused");
		} catch (error) {
			expect(isApiError(error) && error.details).toEqual({
				reason: "in_person",
			});
		}
		const [plainRow] = await db
			.select({ status: taskSubmissions.status })
			.from(taskSubmissions)
			.where(eq(taskSubmissions.id, plain.id))
			.limit(1);
		expect(plainRow?.status).toBe("pending");
	});
});
