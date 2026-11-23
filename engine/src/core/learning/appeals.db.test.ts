import { afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	appeals,
	centerStaff,
	contentVersions,
	courses,
	districts,
	enrollments,
	feedbackSnippets,
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
import { closeAppeal, fileAppeal, listAppeals } from "./appeals";
import {
	createFeedbackSnippet,
	updateFeedbackSnippet,
} from "./feedback-library";

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

test("one appeal is decided by someone else and the rejection stays stored", async () => {
	if (!suite) throw new Error("DATABASE_URL is missing");
	const { db } = suite;
	const stamp = Date.now().toString(36);
	const learner = await createUserWithPassport(db, {
		email: `appeal-${stamp}-learner@demo.ikiraro.test`,
		name: "Appeal learner",
	});
	const first = await createUserWithPassport(db, {
		email: `appeal-${stamp}-a@demo.ikiraro.test`,
		name: "Appeal trainer A",
	});
	const second = await createUserWithPassport(db, {
		email: `appeal-${stamp}-b@demo.ikiraro.test`,
		name: "Appeal trainer B",
	});
	const [province] = await db
		.insert(provinces)
		.values({ code: `ap-${stamp}`, name: "Appeal province" })
		.returning({ id: provinces.id });
	const [district] = await db
		.insert(districts)
		.values({
			provinceId: province?.id ?? "",
			code: `ad-${stamp}`,
			name: "Appeal district",
		})
		.returning({ id: districts.id });
	const [sector] = await db
		.insert(sectors)
		.values({
			districtId: district?.id ?? "",
			code: `as-${stamp}`,
			name: "Appeal sector",
		})
		.returning({ id: sectors.id });
	const [center] = await db
		.insert(learningCenters)
		.values({ sectorId: sector?.id ?? "", name: `Appeal center ${stamp}` })
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
			snapshot: { titleEn: "Appeal" },
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
	const [submission] = await db
		.insert(taskSubmissions)
		.values({
			id: crypto.randomUUID(),
			enrollmentId: enrollment?.id ?? "",
			taskId: task?.id ?? "",
			contentVersionId: version?.id ?? "",
			ownerUserId: learner.userId,
			attempt: 1,
			status: "rejected",
			evidenceType: "note",
			note: "A page from a private center.",
			submittedAt: new Date(),
		})
		.returning({ id: taskSubmissions.id });
	const [verification] = await db
		.insert(submissionVerifications)
		.values({
			submissionId: submission?.id ?? "",
			reviewerUserId: first.userId,
			decision: "rejected",
			note: "This is not the task.",
			reasonCode: "not_the_task",
		})
		.returning({ id: submissionVerifications.id });
	const [role] = await db
		.select({ id: roles.id })
		.from(roles)
		.where(eq(roles.code, "trainer"))
		.limit(1);
	if (!role || !center || !submission || !verification) {
		throw new Error("The appeal fixture was not stored.");
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
	let appealId = "";
	let snippetId = "";
	try {
		const opened = await fileAppeal(db, {
			learnerId: learner.userId,
			submissionId: submission.id,
			note: "Please read this again.",
			ip: "127.0.0.1",
		});
		appealId = opened.id;
		try {
			await fileAppeal(db, {
				learnerId: learner.userId,
				submissionId: submission.id,
				note: "A second ask.",
				ip: "127.0.0.1",
			});
			throw new Error("a second appeal was stored");
		} catch (error) {
			if (!isApiError(error) || error.status !== 409) throw error;
		}
		const own = await listAppeals(db, { reviewerId: first.userId });
		const other = await listAppeals(db, { reviewerId: second.userId });
		expect(own.items).toHaveLength(0);
		expect(other.items.map((item) => item.id)).toEqual([appealId]);
		try {
			await closeAppeal(db, {
				reviewerId: first.userId,
				appealId,
				outcome: "overturned",
				note: "The first trainer should not decide this.",
				ip: "127.0.0.1",
			});
			throw new Error("the first trainer decided their own rejection");
		} catch (error) {
			if (!isApiError(error) || error.status !== 404) throw error;
		}
		const closed = await closeAppeal(db, {
			reviewerId: second.userId,
			appealId,
			outcome: "overturned",
			note: "They can send the work again.",
			ip: "127.0.0.1",
		});
		expect(closed.status).toBe("overturned");
		const [kept] = await db
			.select({ decision: submissionVerifications.decision })
			.from(submissionVerifications)
			.where(eq(submissionVerifications.id, verification.id));
		expect(kept?.decision).toBe("rejected");
		const line = await createFeedbackSnippet(db, {
			actorId: second.userId,
			locale: "en",
			body: `A private line ${stamp}`,
			ip: "127.0.0.1",
		});
		snippetId = line.id;
		const changed = await updateFeedbackSnippet(db, {
			actorId: second.userId,
			id: line.id,
			locale: "rw",
			body: `Umurongo ${stamp}`,
			ip: "127.0.0.1",
		});
		expect(changed.locale).toBe("rw");
		expect(changed.body).toBe(`Umurongo ${stamp}`);
	} finally {
		if (appealId) await db.delete(appeals).where(eq(appeals.id, appealId));
		if (snippetId) {
			await db
				.delete(feedbackSnippets)
				.where(eq(feedbackSnippets.id, snippetId));
		}
	}
}, 60_000);
