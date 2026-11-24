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
	learningCenters,
	modules,
	provinces,
	roles,
	sectors,
	submissionVerifications,
	taskSubmissions,
	tasks,
	userRoles,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import { createVerification } from "../learning/verifications";
import { downloadContentPack, listContentPacks } from "./packs";

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

describe.serial("offline packs and review time", () => {
	test("a center pack has the course, and a review keeps the time it was made", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const db = suite.db;
		const stamp = Date.now().toString(36);
		const title = `Pack ${stamp}`;
		const learner = await createUserWithPassport(db, {
			email: `pack-learner-${stamp}@demo.ikiraro.test`,
			name: "Pack learner",
		});
		const trainer = await createUserWithPassport(db, {
			email: `pack-trainer-${stamp}@demo.ikiraro.test`,
			name: "Pack trainer",
		});
		const other = await createUserWithPassport(db, {
			email: `pack-other-${stamp}@demo.ikiraro.test`,
			name: "Other trainer",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `pp-${stamp}`, name: "Pack province" })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `pd-${stamp}`,
				name: "Pack district",
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `ps-${stamp}`,
				name: "Pack sector",
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Pack center ${stamp}` })
			.returning({ id: learningCenters.id });
		const [elsewhere] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Other center ${stamp}` })
			.returning({ id: learningCenters.id });
		const [course] = await db
			.insert(courses)
			.values({ status: "published", createdByUserId: learner.userId })
			.returning({ id: courses.id });
		const [module] = await db
			.insert(modules)
			.values({ courseId: course?.id ?? "", position: 0, status: "published" })
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
		const [version] = await db
			.insert(contentVersions)
			.values({
				courseId: course?.id ?? "",
				versionNumber: 1,
				snapshot: {
					titleEn: title,
					titleRw: title,
					modules: [
						{
							id: module?.id ?? "",
							position: 0,
							tasks: [
								{
									id: task?.id ?? "",
									position: 0,
									required: false,
									evidenceType: "note",
								},
							],
						},
					],
				},
			})
			.returning({ id: contentVersions.id });
		if (!center || !elsewhere || !course || !version || !task) {
			throw new Error("The pack fixture was not stored.");
		}
		const [enrollment] = await db
			.insert(enrollments)
			.values({
				userId: learner.userId,
				courseId: course.id,
				contentVersionId: version.id,
				centerId: center.id,
			})
			.returning({ id: enrollments.id });
		const [role] = await db
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.code, "trainer"))
			.limit(1);
		if (!role || !enrollment) throw new Error("trainer role was not found");
		await db.insert(userRoles).values([
			{
				userId: trainer.userId,
				roleId: role.id,
				scopeType: "center",
				scopeId: center.id,
			},
			{
				userId: other.userId,
				roleId: role.id,
				scopeType: "center",
				scopeId: elsewhere.id,
			},
		]);
		await db.insert(centerStaff).values([
			{ centerId: center.id, userId: trainer.userId, role: "trainer" },
			{ centerId: elsewhere.id, userId: other.userId, role: "trainer" },
		]);
		const submittedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
		const reviewedAt = new Date(Date.now() - 30 * 60 * 1000);
		const [waiting] = await db
			.insert(taskSubmissions)
			.values({
				id: crypto.randomUUID(),
				enrollmentId: enrollment.id,
				taskId: task.id,
				contentVersionId: version.id,
				ownerUserId: learner.userId,
				attempt: 1,
				status: "pending",
				evidenceType: "note",
				note: "The stock count.",
				submittedAt,
			})
			.returning({ id: taskSubmissions.id });
		if (!waiting) throw new Error("The attempt was not stored.");

		const listed = await listContentPacks(db, trainer.userId);
		expect(listed.centers.some((row) => row.id === center.id)).toBe(true);
		expect(listed.courses.some((row) => row.id === course.id)).toBe(true);
		const pack = await downloadContentPack(db, {
			userId: trainer.userId,
			centerId: center.id,
			courseId: course.id,
			ip: "127.0.0.1",
		});
		expect(pack.file.includes(title)).toBe(true);
		expect(pack.file.includes("demo.ikiraro.test")).toBe(false);
		try {
			await downloadContentPack(db, {
				userId: learner.userId,
				centerId: center.id,
				courseId: course.id,
				ip: "127.0.0.1",
			});
			throw new Error("expected the learner to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(403);
			expect(reasonOf(error)).toBe("scope");
		}
		try {
			await downloadContentPack(db, {
				userId: other.userId,
				centerId: center.id,
				courseId: course.id,
				ip: "127.0.0.1",
			});
			throw new Error("expected the other center to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(403);
			expect(reasonOf(error)).toBe("scope");
		}
		try {
			await downloadContentPack(db, {
				userId: trainer.userId,
				centerId: " ",
				courseId: course.id,
				ip: "127.0.0.1",
			});
			throw new Error("expected a blank center to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(400);
			expect(reasonOf(error)).toBe("center");
		}

		await createVerification(db, {
			reviewerId: trainer.userId,
			submissionId: waiting.id,
			decision: "needs_revision",
			note: "Add the date.",
			reviewedAt: reviewedAt.toISOString(),
			ip: "127.0.0.1",
		});
		const [stored] = await db
			.select({ decidedAt: submissionVerifications.decidedAt })
			.from(submissionVerifications)
			.where(eq(submissionVerifications.submissionId, waiting.id));
		expect(stored?.decidedAt.getTime()).toBe(reviewedAt.getTime());
		try {
			await createVerification(db, {
				reviewerId: trainer.userId,
				submissionId: waiting.id,
				decision: "needs_revision",
				note: "Add the date.",
				reviewedAt: reviewedAt.toISOString(),
				ip: "127.0.0.1",
			});
			throw new Error("expected a closed attempt to stay closed");
		} catch (error) {
			expect(statusOf(error)).toBe(409);
			expect(reasonOf(error)).toBe("closed");
		}
		const [again] = await db
			.select({ decidedAt: submissionVerifications.decidedAt })
			.from(submissionVerifications)
			.where(eq(submissionVerifications.submissionId, waiting.id));
		expect(again?.decidedAt.getTime()).toBe(reviewedAt.getTime());

		const [second] = await db
			.insert(taskSubmissions)
			.values({
				id: crypto.randomUUID(),
				enrollmentId: enrollment.id,
				taskId: task.id,
				contentVersionId: version.id,
				ownerUserId: learner.userId,
				attempt: 2,
				status: "pending",
				evidenceType: "note",
				note: "The stock count again.",
				submittedAt,
			})
			.returning({ id: taskSubmissions.id });
		if (!second) throw new Error("The second attempt was not stored.");
		const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
		try {
			await createVerification(db, {
				reviewerId: trainer.userId,
				submissionId: second.id,
				decision: "needs_revision",
				note: "Later.",
				reviewedAt: future,
				ip: "127.0.0.1",
			});
			throw new Error("expected a future time to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(400);
			expect(reasonOf(error)).toBe("time");
		}
		try {
			await createVerification(db, {
				reviewerId: trainer.userId,
				submissionId: second.id,
				decision: "needs_revision",
				note: "Earlier.",
				reviewedAt: new Date(submittedAt.getTime() - 60_000).toISOString(),
				ip: "127.0.0.1",
			});
			throw new Error("expected a time before the work to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(400);
			expect(reasonOf(error)).toBe("time");
		}
		try {
			await createVerification(db, {
				reviewerId: trainer.userId,
				submissionId: second.id,
				decision: "needs_revision",
				note: "Blank.",
				reviewedAt: "  ",
				ip: "127.0.0.1",
			});
			throw new Error("expected a blank time to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(400);
			expect(reasonOf(error)).toBe("time");
		}

		const approvedAt = new Date(Date.now() - 20 * 60 * 1000);
		await createVerification(db, {
			reviewerId: trainer.userId,
			submissionId: second.id,
			decision: "approved",
			note: "Seen.",
			reviewedAt: approvedAt.toISOString(),
			idempotencyKey: crypto.randomUUID(),
			ip: "127.0.0.1",
		});
		const [awarded] = await db
			.select({ decidedAt: submissionVerifications.decidedAt })
			.from(submissionVerifications)
			.where(eq(submissionVerifications.submissionId, second.id));
		expect(awarded?.decidedAt.getTime()).toBe(approvedAt.getTime());
	}, 120_000);
});
