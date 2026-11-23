import { afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	contentVersions,
	courses,
	districts,
	enrollments,
	learningCenters,
	modules,
	provinces,
	sectors,
	taskSubmissions,
	tasks,
} from "../../db/schema";
import { createUserWithPassport } from "../identity/create-user";
import { escalateOverdue } from "./sla";

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

test("an overdue attempt moves to the center manager, then the district", async () => {
	if (!suite) throw new Error("DATABASE_URL is missing");
	const { db } = suite;
	const stamp = Date.now().toString(36);
	const learner = await createUserWithPassport(db, {
		email: `sla-${stamp}@demo.ikiraro.test`,
		name: "SLA learner",
	});
	const [province] = await db
		.insert(provinces)
		.values({ code: `p-${stamp}`, name: "SLA province" })
		.returning({ id: provinces.id });
	const [district] = await db
		.insert(districts)
		.values({
			provinceId: province?.id ?? "",
			code: `d-${stamp}`,
			name: "SLA district",
		})
		.returning({ id: districts.id });
	const [sector] = await db
		.insert(sectors)
		.values({
			districtId: district?.id ?? "",
			code: `s-${stamp}`,
			name: "SLA sector",
		})
		.returning({ id: sectors.id });
	const [center] = await db
		.insert(learningCenters)
		.values({ sectorId: sector?.id ?? "", name: `SLA center ${stamp}` })
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
			snapshot: { titleEn: "SLA" },
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
	const due = new Date(Date.now() - 60_000);
	const [submission] = await db
		.insert(taskSubmissions)
		.values({
			id: crypto.randomUUID(),
			enrollmentId: enrollment?.id ?? "",
			taskId: task?.id ?? "",
			contentVersionId: version?.id ?? "",
			ownerUserId: learner.userId,
			attempt: 1,
			status: "pending",
			evidenceType: "note",
			note: "A note past the review time.",
			submittedAt: new Date(due.getTime() - 72 * 60 * 60 * 1000),
			reviewDueAt: due,
		})
		.returning({ id: taskSubmissions.id });
	if (!submission) throw new Error("The attempt was not stored.");
	try {
		await escalateOverdue(db, new Date());
		const [first] = await db
			.select({ escalation: taskSubmissions.escalation })
			.from(taskSubmissions)
			.where(eq(taskSubmissions.id, submission.id));
		expect(first?.escalation).toBe("manager");
		await db
			.update(taskSubmissions)
			.set({ reviewDueAt: new Date(Date.now() - 73 * 60 * 60 * 1000) })
			.where(eq(taskSubmissions.id, submission.id));
		await escalateOverdue(db, new Date());
		const [second] = await db
			.select({ escalation: taskSubmissions.escalation })
			.from(taskSubmissions)
			.where(eq(taskSubmissions.id, submission.id));
		expect(second?.escalation).toBe("district");
	} finally {
		await db
			.delete(taskSubmissions)
			.where(eq(taskSubmissions.id, submission.id));
	}
}, 60_000);
