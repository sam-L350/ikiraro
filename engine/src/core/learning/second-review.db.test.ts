import { afterAll, expect, test } from "bun:test";
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
	pointTransactions,
	provinces,
	roles,
	secondReviews,
	sectors,
	submissionVerifications,
	taskSubmissions,
	tasks,
	userRoles,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import {
	closeSecondReview,
	listSecondReviews,
	loadQuality,
	openSecondReviewIfSampled,
} from "./second-review";

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

test("a sampled approval keeps its decision when the second reading disagrees", async () => {
	if (!suite) throw new Error("DATABASE_URL is missing");
	const { db } = suite;
	const stamp = Date.now().toString(36);
	const learner = await createUserWithPassport(db, {
		email: `second-${stamp}-learner@demo.ikiraro.test`,
		name: "Second learner",
	});
	const first = await createUserWithPassport(db, {
		email: `second-${stamp}-a@demo.ikiraro.test`,
		name: "Second trainer A",
	});
	const second = await createUserWithPassport(db, {
		email: `second-${stamp}-b@demo.ikiraro.test`,
		name: "Second trainer B",
	});
	const [province] = await db
		.insert(provinces)
		.values({ code: `p-${stamp}`, name: "Second province" })
		.returning({ id: provinces.id });
	const [district] = await db
		.insert(districts)
		.values({
			provinceId: province?.id ?? "",
			code: `d-${stamp}`,
			name: "Second district",
		})
		.returning({ id: districts.id });
	const [sector] = await db
		.insert(sectors)
		.values({
			districtId: district?.id ?? "",
			code: `s-${stamp}`,
			name: "Second sector",
		})
		.returning({ id: sectors.id });
	const [center] = await db
		.insert(learningCenters)
		.values({ sectorId: sector?.id ?? "", name: `Second center ${stamp}` })
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
			snapshot: { titleEn: "Second" },
		})
		.returning({ id: contentVersions.id });
	const [enrollment] = await db
		.insert(enrollments)
		.values({
			userId: learner.userId,
			courseId: course?.id ?? "",
			contentVersionId: version?.id ?? "",
			centerId: center?.id ?? "",
		})
		.returning({ id: enrollments.id });
	const decidedAt = new Date();
	const submittedAt = new Date(decidedAt.getTime() - 10 * 60 * 1000);
	const [submission] = await db
		.insert(taskSubmissions)
		.values({
			id: crypto.randomUUID(),
			enrollmentId: enrollment?.id ?? "",
			taskId: task?.id ?? "",
			contentVersionId: version?.id ?? "",
			ownerUserId: learner.userId,
			attempt: 1,
			status: "approved",
			evidenceType: "note",
			note: "A page from a private center.",
			submittedAt,
		})
		.returning({ id: taskSubmissions.id });
	const [verification] = await db
		.insert(submissionVerifications)
		.values({
			submissionId: submission?.id ?? "",
			reviewerUserId: first.userId,
			decision: "approved",
			note: "The page matches the task.",
			decidedAt,
		})
		.returning({ id: submissionVerifications.id });
	const [role] = await db
		.select({ id: roles.id })
		.from(roles)
		.where(eq(roles.code, "trainer"))
		.limit(1);
	if (!role || !center || !submission || !verification) {
		throw new Error("The second-review fixture was not stored.");
	}
	await db.insert(userRoles).values([
		{
			userId: first.userId,
			roleId: role.id,
			scopeType: "center",
			scopeId: center.id,
		},
		{
			userId: second.userId,
			roleId: role.id,
			scopeType: "center",
			scopeId: center.id,
		},
	]);
	await db.insert(centerStaff).values([
		{ centerId: center.id, userId: first.userId, role: "trainer" },
		{ centerId: center.id, userId: second.userId, role: "trainer" },
	]);
	let reviewId = "";
	try {
		await openSecondReviewIfSampled(db, {
			verificationId: verification.id,
			submissionId: submission.id,
			reviewerId: first.userId,
			ip: "127.0.0.1",
		});
		await openSecondReviewIfSampled(db, {
			verificationId: verification.id,
			submissionId: submission.id,
			reviewerId: first.userId,
			ip: "127.0.0.1",
		});
		const opened = await db
			.select({ id: secondReviews.id })
			.from(secondReviews)
			.where(eq(secondReviews.verificationId, verification.id));
		expect(opened).toHaveLength(1);
		reviewId = opened[0]?.id ?? "";
		const own = await listSecondReviews(db, { reviewerId: first.userId });
		const other = await listSecondReviews(db, { reviewerId: second.userId });
		expect(own.items).toHaveLength(0);
		expect(other.items.map((item) => item.id)).toEqual([reviewId]);
		try {
			await closeSecondReview(db, {
				reviewerId: first.userId,
				reviewId,
				outcome: "disagreed",
				note: "The first trainer should not close this.",
				ip: "127.0.0.1",
			});
			throw new Error("the first trainer closed their own sample");
		} catch (error) {
			if (!isApiError(error) || error.status !== 404) throw error;
		}
		const closed = await closeSecondReview(db, {
			reviewerId: second.userId,
			reviewId,
			outcome: "disagreed",
			note: "The page does not match.",
			ip: "127.0.0.1",
		});
		expect(closed.status).toBe("disagreed");
		const [kept] = await db
			.select({ decision: submissionVerifications.decision })
			.from(submissionVerifications)
			.where(eq(submissionVerifications.id, verification.id));
		expect(kept?.decision).toBe("approved");
		const points = await db
			.select({ id: pointTransactions.id })
			.from(pointTransactions)
			.where(eq(pointTransactions.userId, learner.userId));
		expect(points).toHaveLength(0);
		const after = await listSecondReviews(db, { reviewerId: second.userId });
		expect(after.items).toHaveLength(0);
		const quality = await loadQuality(db, {
			viewerId: first.userId,
			centerIds: [center.id],
			selfOnly: true,
			anomalies: false,
		});
		expect(quality.anomalies).toBeNull();
		expect(quality.trainers).toHaveLength(1);
		expect(quality.trainers[0]?.approvalRate).toBe(100);
		expect(quality.trainers[0]?.reworkRate).toBe(0);
		expect(quality.trainers[0]?.disagreementRate).toBe(100);
		expect(quality.trainers[0]?.medianReviewMinutes).toBe(10);
	} finally {
		// The approval is append-only. The second reading is not, so only it is removed.
		if (reviewId) {
			await db.delete(secondReviews).where(eq(secondReviews.id, reviewId));
		}
	}
}, 60_000);
