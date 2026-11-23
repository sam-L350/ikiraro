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
	contentVersions,
	courses,
	districts,
	enrollments,
	learningCenters,
	mediaObjects,
	modules,
	provinces,
	sectors,
	taskSubmissions,
	tasks,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { insertUserWithPassport } from "../identity/create-user";
import {
	canWithdraw,
	createBlock,
	createSubmission,
	listSubmissions,
	nextAttempt,
	nextAttemptStatuses,
	withdrawSubmission,
} from "./submissions";

describe("submission rules", () => {
	test("a waiting attempt blocks another, and three send-backs still leave one try", () => {
		expect(createBlock([])).toBe("ok");
		expect(createBlock(["withdrawn"])).toBe("ok");
		expect(createBlock(["pending"])).toBe("open");
		expect(createBlock(["draft", "withdrawn"])).toBe("open");
		expect(createBlock(["in_review"])).toBe("open");
		expect(createBlock(["approved"])).toBe("closed");
		expect(createBlock(["needs_revision"])).toBe("ok");
		expect(
			createBlock([
				"needs_revision",
				"needs_revision",
				"needs_revision",
				"needs_revision",
			]),
		).toBe("limit");
		expect(createBlock(["rejected"])).toBe("closed");
		expect(
			createBlock(
				nextAttemptStatuses([
					{ status: "rejected", revoked: false, overturned: true },
				]),
			),
		).toBe("ok");
		expect(
			createBlock(
				nextAttemptStatuses([
					{ status: "rejected", revoked: false, overturned: false },
				]),
			),
		).toBe("closed");
		expect(createBlock(["escalated"])).toBe("closed");
		expect(nextAttempt([])).toBe(1);
		expect(nextAttempt([1, 3])).toBe(4);
	});

	test("withdrawal is only open before review starts", () => {
		expect(canWithdraw("draft")).toBe(true);
		expect(canWithdraw("pending")).toBe(true);
		expect(canWithdraw("in_review")).toBe(false);
		expect(canWithdraw("approved")).toBe(false);
		expect(canWithdraw("needs_revision")).toBe(false);
		expect(canWithdraw("rejected")).toBe(false);
		expect(canWithdraw("escalated")).toBe(false);
		expect(canWithdraw("withdrawn")).toBe(false);
	});
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

describe("task submissions", () => {
	test("a photo stores the hash, a second attempt waits, and review blocks withdrawal", async () => {
		useTestEnv();
		if (!suite) return;
		const database = suite.db;
		const suffix = crypto.randomUUID().slice(0, 8);
		const learner = await insertUserWithPassport(database, {
			email: `submit-${suffix}@example.test`,
		});
		const other = await insertUserWithPassport(database, {
			email: `other-${suffix}@example.test`,
		});
		const [province] = await database
			.insert(provinces)
			.values({ code: `p-${suffix}`, name: "Province" })
			.returning({ id: provinces.id });
		const [district] = await database
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `d-${suffix}`,
				name: "District",
			})
			.returning({ id: districts.id });
		const [sector] = await database
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `s-${suffix}`,
				name: "Sector",
			})
			.returning({ id: sectors.id });
		const [center] = await database
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: "Center" })
			.returning({ id: learningCenters.id });
		const [course] = await database
			.insert(courses)
			.values({ status: "published", createdByUserId: learner.userId })
			.returning({ id: courses.id });
		const [module] = await database
			.insert(modules)
			.values({ courseId: course?.id ?? "", position: 0, status: "published" })
			.returning({ id: modules.id });
		const [photoTask] = await database
			.insert(tasks)
			.values({
				moduleId: module?.id ?? "",
				position: 0,
				status: "published",
				evidenceType: "photo",
			})
			.returning({ id: tasks.id });
		const [noteTask] = await database
			.insert(tasks)
			.values({
				moduleId: module?.id ?? "",
				position: 1,
				status: "published",
				evidenceType: "note",
			})
			.returning({ id: tasks.id });
		if (!course || !module || !photoTask || !noteTask || !center) {
			throw new Error("fixture was not stored");
		}
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
							id: photoTask.id,
							position: 0,
							required: true,
							titleEn: "Page",
							titleRw: "",
							instructionsEn: "Photograph the page.",
							instructionsRw: "",
							evidenceType: "photo",
							criteria: [],
						},
						{
							id: noteTask.id,
							position: 1,
							required: true,
							titleEn: "Note",
							titleRw: "",
							instructionsEn: "Write the note.",
							instructionsRw: "",
							evidenceType: "note",
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
				publishedByUserId: learner.userId,
			})
			.returning({ id: contentVersions.id });
		const [enrollment] = await database
			.insert(enrollments)
			.values({
				userId: learner.userId,
				courseId: course.id,
				contentVersionId: version?.id ?? "",
				centerId: center.id,
			})
			.returning({ id: enrollments.id });
		const [media] = await database
			.insert(mediaObjects)
			.values({
				ownerUserId: learner.userId,
				objectKey: `evidence/${crypto.randomUUID()}`,
				contentType: "image/jpeg",
				declaredBytes: 4,
				sizeBytes: 4,
				sha256: "a".repeat(64),
				status: "ready",
				finalizedAt: new Date(),
			})
			.returning({ id: mediaObjects.id });
		if (!enrollment || !media || !version) {
			throw new Error("fixture was not stored");
		}
		const firstId = crypto.randomUUID();
		const created = await createSubmission(database, {
			id: firstId,
			enrollmentId: enrollment.id,
			taskId: photoTask.id,
			ownerUserId: learner.userId,
			mediaId: media.id,
			deviceInfo: "phone",
			geoLat: -1.94,
			geoLng: 30.06,
			submit: true,
			ip: "127.0.0.1",
		});
		expect(created.attempt).toBe(1);
		expect(created.status).toBe("pending");
		expect(created.feedback).toBeNull();
		const [stored] = await database
			.select({
				contentHash: taskSubmissions.contentHash,
				contentVersionId: taskSubmissions.contentVersionId,
				deviceInfo: taskSubmissions.deviceInfo,
				geoLat: taskSubmissions.geoLat,
			})
			.from(taskSubmissions)
			.where(eq(taskSubmissions.id, firstId))
			.limit(1);
		expect(stored?.contentHash).toBe("a".repeat(64));
		expect(stored?.contentVersionId).toBe(version.id);
		expect(stored?.deviceInfo).toBe("phone");
		expect(stored?.geoLat).toBeCloseTo(-1.94);

		const again = await createSubmission(database, {
			id: firstId,
			enrollmentId: enrollment.id,
			taskId: photoTask.id,
			ownerUserId: learner.userId,
			mediaId: media.id,
			submit: true,
			ip: "127.0.0.1",
		});
		expect(again.attempt).toBe(1);

		try {
			await createSubmission(database, {
				id: crypto.randomUUID(),
				enrollmentId: enrollment.id,
				taskId: photoTask.id,
				ownerUserId: learner.userId,
				mediaId: media.id,
				submit: true,
				ip: "127.0.0.1",
			});
			throw new Error("expected the open attempt to block");
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(409);
		}

		const taken = await withdrawSubmission(database, {
			id: firstId,
			ownerUserId: learner.userId,
			ip: "127.0.0.1",
		});
		expect(taken.status).toBe("withdrawn");
		const takenAgain = await withdrawSubmission(database, {
			id: firstId,
			ownerUserId: learner.userId,
			ip: "127.0.0.1",
		});
		expect(takenAgain.status).toBe("withdrawn");

		try {
			await withdrawSubmission(database, {
				id: firstId,
				ownerUserId: other.userId,
				ip: "127.0.0.1",
			});
			throw new Error("expected another learner to miss the row");
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(404);
		}

		const second = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: enrollment.id,
			taskId: photoTask.id,
			ownerUserId: learner.userId,
			mediaId: media.id,
			submit: true,
			ip: "127.0.0.1",
		});
		expect(second.attempt).toBe(2);
		await database
			.update(taskSubmissions)
			.set({ status: "in_review" })
			.where(eq(taskSubmissions.id, second.id));
		try {
			await withdrawSubmission(database, {
				id: second.id,
				ownerUserId: learner.userId,
				ip: "127.0.0.1",
			});
			throw new Error("expected review to block withdrawal");
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(409);
		}
		const [stillReview] = await database
			.select({ status: taskSubmissions.status })
			.from(taskSubmissions)
			.where(eq(taskSubmissions.id, second.id))
			.limit(1);
		expect(stillReview?.status).toBe("in_review");

		const note = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: enrollment.id,
			taskId: noteTask.id,
			ownerUserId: learner.userId,
			note: "The page is readable.",
			submit: false,
			ip: "127.0.0.1",
		});
		expect(note.status).toBe("draft");
		expect(note.submittedAt).toBeNull();
		const history = await listSubmissions(database, {
			enrollmentId: enrollment.id,
			ownerUserId: learner.userId,
		});
		expect(history.map((item) => item.id)).toContain(note.id);
		expect(history.map((item) => item.id)).toContain(second.id);
		expect(history.every((item) => item.feedback === null)).toBe(true);
	}, 60_000);
});
