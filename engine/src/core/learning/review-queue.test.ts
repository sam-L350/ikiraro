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
	centerStaff,
	contentVersions,
	courses,
	districts,
	enrollments,
	learningCenters,
	mediaObjects,
	modules,
	provinces,
	roles,
	rubricCriteria,
	sectors,
	taskSubmissions,
	tasks,
	taskTranslations,
	userRoles,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { insertUserWithPassport } from "../identity/create-user";
import { createMemoryObjectStore } from "../storage/object-store";
import {
	listEvidenceQueue,
	readEvidenceReview,
	reviewUrgency,
	startEvidenceReview,
} from "./review-queue";
import { createSubmission, withdrawSubmission } from "./submissions";

test("a photo is due soon in the last twelve hours of the window", () => {
	const now = new Date("2026-11-23T12:00:00.000Z");
	expect(reviewUrgency(new Date("2026-11-23T11:00:00.000Z"), now)).toBe("ok");
	expect(reviewUrgency(new Date("2026-11-20T23:00:00.000Z"), now)).toBe("soon");
	expect(reviewUrgency(new Date("2026-11-20T12:00:00.000Z"), now)).toBe(
		"overdue",
	);
});

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

describe("evidence review queue", () => {
	test("a trainer sees the oldest work at their centers, and another center stays hidden", async () => {
		useTestEnv();
		if (!suite) return;
		const database = suite.db;
		const suffix = crypto.randomUUID().slice(0, 8);
		const learnerA = await insertUserWithPassport(database, {
			email: `queue-a-${suffix}@example.test`,
			name: "Aline",
		});
		const learnerB = await insertUserWithPassport(database, {
			email: `queue-b-${suffix}@example.test`,
			name: "Bob",
		});
		const learnerC = await insertUserWithPassport(database, {
			email: `queue-c-${suffix}@example.test`,
			name: "Claire",
		});
		const trainer = await insertUserWithPassport(database, {
			email: `queue-trainer-${suffix}@example.test`,
			name: "Trainer",
		});
		const wide = await insertUserWithPassport(database, {
			email: `queue-wide-${suffix}@example.test`,
			name: "Wide",
		});
		const coordinator = await insertUserWithPassport(database, {
			email: `queue-coord-${suffix}@example.test`,
			name: "Coordinator",
		});
		const [province] = await database
			.insert(provinces)
			.values({ code: `p-${suffix}`, name: "Province" })
			.returning({ id: provinces.id });
		const [districtA] = await database
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `da-${suffix}`,
				name: "District A",
			})
			.returning({ id: districts.id });
		const [districtB] = await database
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `db-${suffix}`,
				name: "District B",
			})
			.returning({ id: districts.id });
		const [sectorA] = await database
			.insert(sectors)
			.values({
				districtId: districtA?.id ?? "",
				code: `sa-${suffix}`,
				name: "Sector A",
			})
			.returning({ id: sectors.id });
		const [sectorB] = await database
			.insert(sectors)
			.values({
				districtId: districtB?.id ?? "",
				code: `sb-${suffix}`,
				name: "Sector B",
			})
			.returning({ id: sectors.id });
		const [centerA] = await database
			.insert(learningCenters)
			.values({ sectorId: sectorA?.id ?? "", name: `Center A ${suffix}` })
			.returning({ id: learningCenters.id });
		const [centerB] = await database
			.insert(learningCenters)
			.values({ sectorId: sectorA?.id ?? "", name: `Center B ${suffix}` })
			.returning({ id: learningCenters.id });
		const [centerC] = await database
			.insert(learningCenters)
			.values({ sectorId: sectorB?.id ?? "", name: `Center C ${suffix}` })
			.returning({ id: learningCenters.id });
		const [course] = await database
			.insert(courses)
			.values({ status: "published", createdByUserId: learnerA.userId })
			.returning({ id: courses.id });
		const [module] = await database
			.insert(modules)
			.values({ courseId: course?.id ?? "", position: 0, status: "published" })
			.returning({ id: modules.id });
		const [oldTask] = await database
			.insert(tasks)
			.values({
				moduleId: module?.id ?? "",
				position: 0,
				status: "published",
				evidenceType: "note",
			})
			.returning({ id: tasks.id });
		const [newTask] = await database
			.insert(tasks)
			.values({
				moduleId: module?.id ?? "",
				position: 1,
				status: "published",
				evidenceType: "note",
			})
			.returning({ id: tasks.id });
		const [photoTask] = await database
			.insert(tasks)
			.values({
				moduleId: module?.id ?? "",
				position: 2,
				status: "published",
				evidenceType: "photo",
			})
			.returning({ id: tasks.id });
		if (
			!province ||
			!districtA ||
			!districtB ||
			!sectorA ||
			!sectorB ||
			!centerA ||
			!centerB ||
			!centerC ||
			!course ||
			!module ||
			!oldTask ||
			!newTask ||
			!photoTask
		) {
			throw new Error("fixture was not stored");
		}
		await database.insert(taskTranslations).values([
			{
				taskId: oldTask.id,
				locale: "en",
				title: "Older note",
				instructions: "Write the older note.",
			},
			{
				taskId: oldTask.id,
				locale: "rw",
				title: "Inyandiko ishaje",
				instructions: "Andika inyandiko.",
			},
		]);
		await database.insert(rubricCriteria).values({
			taskId: oldTask.id,
			position: 0,
			weight: 1,
			promptEn: "The note names the page.",
			promptRw: "Inyandiko ivuga urupapuro.",
		});
		const snapshot = {
			titleEn: "Ledger",
			titleRw: "",
			modules: [
				{
					id: module.id,
					position: 0,
					titleEn: "Module",
					titleRw: "",
					requires: [],
					tasks: [
						{
							id: oldTask.id,
							position: 0,
							required: true,
							titleEn: "Older note",
							titleRw: "Inyandiko ishaje",
							instructionsEn: "Write the older note.",
							instructionsRw: "Andika inyandiko.",
							evidenceType: "note",
							criteria: [],
						},
						{
							id: newTask.id,
							position: 1,
							required: true,
							titleEn: "Newer note",
							titleRw: "",
							instructionsEn: "",
							instructionsRw: "",
							evidenceType: "note",
							criteria: [],
						},
						{
							id: photoTask.id,
							position: 2,
							required: true,
							titleEn: "Photo",
							titleRw: "",
							instructionsEn: "",
							instructionsRw: "",
							evidenceType: "photo",
							criteria: [],
						},
					],
				},
			],
		};
		const [version] = await database
			.insert(contentVersions)
			.values({
				courseId: course.id,
				versionNumber: 1,
				snapshot,
				publishedByUserId: learnerA.userId,
			})
			.returning({ id: contentVersions.id });
		if (!version) throw new Error("version was not stored");
		const courseId = course.id;
		const versionId = version.id;
		async function enroll(userId: number, centerId: string) {
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
		const enrollmentA = await enroll(learnerA.userId, centerA.id);
		const enrollmentB = await enroll(learnerB.userId, centerB.id);
		const enrollmentC = await enroll(learnerC.userId, centerC.id);
		const [media] = await database
			.insert(mediaObjects)
			.values({
				ownerUserId: learnerB.userId,
				objectKey: `evidence/${crypto.randomUUID()}`,
				contentType: "image/jpeg",
				declaredBytes: 4,
				sizeBytes: 4,
				sha256: "b".repeat(64),
				status: "ready",
				finalizedAt: new Date(),
			})
			.returning({ id: mediaObjects.id });
		if (!media) throw new Error("media was not stored");
		const older = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: enrollmentA,
			taskId: oldTask.id,
			ownerUserId: learnerA.userId,
			note: "The older page.",
			submit: true,
			ip: "127.0.0.1",
		});
		const newer = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: enrollmentA,
			taskId: newTask.id,
			ownerUserId: learnerA.userId,
			note: "The newer page.",
			submit: true,
			ip: "127.0.0.1",
		});
		const photo = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: enrollmentB,
			taskId: photoTask.id,
			ownerUserId: learnerB.userId,
			mediaId: media.id,
			submit: true,
			ip: "127.0.0.1",
		});
		const outside = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: enrollmentC,
			taskId: oldTask.id,
			ownerUserId: learnerC.userId,
			note: "Another center.",
			submit: true,
			ip: "127.0.0.1",
		});
		const now = new Date();
		const hours = (count: number) =>
			new Date(now.getTime() - count * 60 * 60 * 1000);
		await database
			.update(taskSubmissions)
			.set({ submittedAt: hours(80) })
			.where(eq(taskSubmissions.id, older.id));
		await database
			.update(taskSubmissions)
			.set({ submittedAt: hours(1) })
			.where(eq(taskSubmissions.id, newer.id));
		await database
			.update(taskSubmissions)
			.set({ submittedAt: hours(61) })
			.where(eq(taskSubmissions.id, photo.id));
		await database
			.update(taskSubmissions)
			.set({ submittedAt: hours(100) })
			.where(eq(taskSubmissions.id, outside.id));

		const [trainerRole] = await database
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.code, "trainer"))
			.limit(1);
		const [coordinatorRole] = await database
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.code, "district_coordinator"))
			.limit(1);
		if (!trainerRole || !coordinatorRole) throw new Error("roles are missing");
		await database.insert(userRoles).values([
			{
				userId: trainer.userId,
				roleId: trainerRole.id,
				scopeType: "center",
				scopeId: centerA.id,
			},
			{
				userId: wide.userId,
				roleId: trainerRole.id,
				scopeType: "center",
				scopeId: centerA.id,
			},
			{
				userId: coordinator.userId,
				roleId: coordinatorRole.id,
				scopeType: "district",
				scopeId: districtA.id,
			},
		]);
		await database.insert(centerStaff).values([
			{ centerId: centerA.id, userId: trainer.userId, role: "trainer" },
			{ centerId: centerA.id, userId: wide.userId, role: "trainer" },
			{ centerId: centerB.id, userId: wide.userId, role: "trainer" },
		]);

		const own = await listEvidenceQueue(database, {
			reviewerId: trainer.userId,
			now,
		});
		expect(own.items.map((item) => item.id)).toEqual([older.id, newer.id]);
		expect(own.items[0]?.urgency).toBe("overdue");
		expect(own.items[0]?.learnerName).toBe("Aline");
		expect(own.items[1]?.urgency).toBe("ok");
		expect(own.centers.map((center) => center.id)).toEqual([centerA.id]);

		const both = await listEvidenceQueue(database, {
			reviewerId: wide.userId,
			now,
		});
		expect(both.items.map((item) => item.id)).toEqual([
			older.id,
			photo.id,
			newer.id,
		]);
		expect(both.items[1]?.urgency).toBe("soon");
		const filtered = await listEvidenceQueue(database, {
			reviewerId: wide.userId,
			centerId: centerB.id,
			now,
		});
		expect(filtered.items.map((item) => item.id)).toEqual([photo.id]);
		try {
			await listEvidenceQueue(database, {
				reviewerId: wide.userId,
				centerId: centerC.id,
				now,
			});
			throw new Error("expected the other center to stay hidden");
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(404);
		}

		const store = createMemoryObjectStore({
			apiUrl: "http://localhost:3000",
			secret: "test-secret",
		});
		const opened = await readEvidenceReview(database, store, {
			reviewerId: wide.userId,
			id: older.id,
			now,
		});
		expect(opened.note).toBe("The older page.");
		expect(opened.evidenceUrl).toBeNull();
		expect(opened.taskTitleEn).toBe("Older note");
		expect(opened.criteria[0]?.promptEn).toBe("The note names the page.");
		const picture = await readEvidenceReview(database, store, {
			reviewerId: wide.userId,
			id: photo.id,
			now,
		});
		expect(picture.evidenceUrl).toContain("/api/media/file?token=");
		expect(picture.evidenceContentType).toBe("image/jpeg");
		try {
			await readEvidenceReview(database, store, {
				reviewerId: trainer.userId,
				id: photo.id,
				now,
			});
			throw new Error("expected the other center's photo to stay hidden");
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(404);
		}

		const started = await startEvidenceReview(database, {
			reviewerId: trainer.userId,
			id: older.id,
			ip: "127.0.0.1",
		});
		expect(started.status).toBe("in_review");
		const again = await startEvidenceReview(database, {
			reviewerId: trainer.userId,
			id: older.id,
			ip: "127.0.0.1",
		});
		expect(again.status).toBe("in_review");
		try {
			await withdrawSubmission(database, {
				id: older.id,
				ownerUserId: learnerA.userId,
				ip: "127.0.0.1",
			});
			throw new Error("expected a started review to block withdrawal");
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(409);
		}

		const district = await listEvidenceQueue(database, {
			reviewerId: coordinator.userId,
			now,
		});
		expect(district.items.map((item) => item.id)).toEqual([
			older.id,
			photo.id,
			newer.id,
		]);
		expect(district.items.map((item) => item.id)).not.toContain(outside.id);
	}, 90_000);
});
