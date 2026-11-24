import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	contentVersions,
	courses,
	districts,
	enrollments,
	learningCenters,
	mentors,
	modules,
	notifications,
	provinces,
	roles,
	sectors,
	taskProgress,
	taskSubmissions,
	tasks,
	userRoles,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import {
	createReportSchedule,
	createWarningRule,
	readReportSchedules,
	readWarnings,
	sendDueReports,
} from "./reports";

const DAY_MS = 24 * 60 * 60 * 1000;

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

describe.serial("scheduled reports and warnings", () => {
	test("a quiet learner and a growing backlog are listed, and the email waits for the interval", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const root = suite.db;
		try {
			await root.transaction(async (db) => {
				await exercise(db);
				throw new Error("rollback");
			});
		} catch (error) {
			if (!(error instanceof Error) || error.message !== "rollback")
				throw error;
		}

		async function exercise(db: Parameters<typeof createWarningRule>[0]) {
			const stamp = Date.now().toString(36);
			const quietName = `Quiet ${stamp}`;
			const activeName = `Active ${stamp}`;
			const finishedName = `Finished ${stamp}`;
			const centerName = `Report center ${stamp}`;
			const districtName = `Report district ${stamp}`;
			const coordinator = await createUserWithPassport(db, {
				email: `report-coordinator-${stamp}@demo.ikiraro.test`,
				name: "Report coordinator",
			});
			const quiet = await createUserWithPassport(db, {
				email: `report-quiet-${stamp}@demo.ikiraro.test`,
				name: quietName,
			});
			const active = await createUserWithPassport(db, {
				email: `report-active-${stamp}@demo.ikiraro.test`,
				name: activeName,
			});
			const finished = await createUserWithPassport(db, {
				email: `report-finished-${stamp}@demo.ikiraro.test`,
				name: finishedName,
			});
			const partner = await createUserWithPassport(db, {
				email: `report-partner-${stamp}@demo.ikiraro.test`,
				name: "Report partner",
			});
			const mentor = await createUserWithPassport(db, {
				email: `report-mentor-${stamp}@demo.ikiraro.test`,
				name: "Report mentor",
			});
			const [province] = await db
				.insert(provinces)
				.values({ code: `rp-${stamp}`, name: "Report province" })
				.returning({ id: provinces.id });
			const [district] = await db
				.insert(districts)
				.values({
					provinceId: province?.id ?? "",
					code: `rd-${stamp}`,
					name: districtName,
				})
				.returning({ id: districts.id });
			const [other] = await db
				.insert(districts)
				.values({
					provinceId: province?.id ?? "",
					code: `ro-${stamp}`,
					name: "Other report district",
				})
				.returning({ id: districts.id });
			const [sector] = await db
				.insert(sectors)
				.values({
					districtId: district?.id ?? "",
					code: `rs-${stamp}`,
					name: "Report sector",
				})
				.returning({ id: sectors.id });
			const [center] = await db
				.insert(learningCenters)
				.values({ sectorId: sector?.id ?? "", name: centerName })
				.returning({ id: learningCenters.id });
			const [course] = await db
				.insert(courses)
				.values({
					status: "published",
					createdByUserId: coordinator.userId,
				})
				.returning({ id: courses.id });
			const [module] = await db
				.insert(modules)
				.values({
					courseId: course?.id ?? "",
					status: "published",
					position: 1,
				})
				.returning({ id: modules.id });
			const [task] = await db
				.insert(tasks)
				.values({
					moduleId: module?.id ?? "",
					status: "published",
					position: 1,
				})
				.returning({ id: tasks.id });
			if (!district || !other || !center || !course || !task) {
				throw new Error("The district was not stored.");
			}
			const [version] = await db
				.insert(contentVersions)
				.values({
					courseId: course.id,
					versionNumber: 1,
					snapshot: {
						modules: [
							{
								tasks: [{ id: task.id, required: true }],
							},
						],
					},
				})
				.returning({ id: contentVersions.id });
			if (!version) throw new Error("The version was not stored.");
			const past = new Date(Date.now() - 10 * DAY_MS);
			const oldSubmit = new Date(Date.now() - 4 * DAY_MS);
			const [quietEnrollment] = await db
				.insert(enrollments)
				.values({
					userId: quiet.userId,
					courseId: course.id,
					contentVersionId: version.id,
					centerId: center.id,
					startedAt: past,
				})
				.returning({ id: enrollments.id });
			const [activeEnrollment] = await db
				.insert(enrollments)
				.values({
					userId: active.userId,
					courseId: course.id,
					contentVersionId: version.id,
					centerId: center.id,
				})
				.returning({ id: enrollments.id });
			const [finishedEnrollment] = await db
				.insert(enrollments)
				.values({
					userId: finished.userId,
					courseId: course.id,
					contentVersionId: version.id,
					centerId: center.id,
					startedAt: past,
				})
				.returning({ id: enrollments.id });
			if (!quietEnrollment || !activeEnrollment || !finishedEnrollment) {
				throw new Error("The enrollment was not stored.");
			}
			await db.insert(taskProgress).values([
				{
					enrollmentId: quietEnrollment.id,
					taskId: task.id,
					status: "started",
					startedAt: past,
				},
				{
					enrollmentId: activeEnrollment.id,
					taskId: task.id,
					status: "started",
				},
				{
					enrollmentId: finishedEnrollment.id,
					taskId: task.id,
					status: "complete",
					startedAt: past,
					completedAt: past,
				},
			]);
			const roleRows = await db
				.select({ id: roles.id, code: roles.code })
				.from(roles);
			const roleId = (code: string) => {
				const row = roleRows.find((item) => item.code === code);
				if (!row) throw new Error("A role was not found.");
				return row.id;
			};
			await db.insert(userRoles).values({
				userId: coordinator.userId,
				roleId: roleId("district_coordinator"),
				scopeType: "district",
				scopeId: district.id,
			});
			await db.insert(mentors).values([
				{
					userId: partner.userId,
					kind: "partner",
					weeklyContactCap: 2,
					status: "approved",
					decidedByUserId: coordinator.userId,
					decidedAt: new Date(),
				},
				{
					userId: mentor.userId,
					kind: "mentor",
					weeklyContactCap: 2,
					status: "approved",
					decidedByUserId: coordinator.userId,
					decidedAt: new Date(),
				},
			]);
			const assignments = [
				{
					role: "district_coordinator" as const,
					scopeType: "district" as const,
					scopeId: district.id,
				},
			];
			try {
				await readWarnings(db, [
					{ role: "learner", scopeType: "self", scopeId: null },
				]);
				throw new Error("expected a learner to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(403);
			}
			try {
				await createWarningRule(db, {
					actorId: coordinator.userId,
					assignments,
					districtId: " ",
					quietDays: 1,
					ip: "127.0.0.1",
				});
				throw new Error("expected a blank district to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("district");
			}
			try {
				await createWarningRule(db, {
					actorId: coordinator.userId,
					assignments,
					districtId: district.id,
					quietDays: 0,
					ip: "127.0.0.1",
				});
				throw new Error("expected zero days to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("days");
			}
			try {
				await createWarningRule(db, {
					actorId: coordinator.userId,
					assignments,
					districtId: other.id,
					quietDays: 1,
					ip: "127.0.0.1",
				});
				throw new Error("expected another district to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(403);
				expect(reasonOf(error)).toBe("district");
			}
			const before = await readWarnings(db, assignments);
			expect(before.rows.some((row) => row.who === quietName)).toBe(false);
			await createWarningRule(db, {
				actorId: coordinator.userId,
				assignments,
				districtId: district.id,
				quietDays: 1,
				ip: "127.0.0.1",
			});
			await db.insert(taskSubmissions).values({
				id: crypto.randomUUID(),
				enrollmentId: quietEnrollment.id,
				taskId: task.id,
				contentVersionId: version.id,
				ownerUserId: quiet.userId,
				attempt: 1,
				status: "pending",
				evidenceType: "note",
				submittedAt: oldSubmit,
			});
			await createWarningRule(db, {
				actorId: coordinator.userId,
				assignments,
				districtId: district.id,
				quietDays: 1,
				ip: "127.0.0.1",
			});
			const listed = await readWarnings(db, assignments);
			const dropout = listed.rows.find((row) => row.who === quietName);
			const backlog = listed.rows.find((row) => row.who === centerName);
			expect(dropout?.kind).toBe("dropout");
			expect((dropout?.ageDays ?? 0) >= 9).toBe(true);
			expect(listed.rows.some((row) => row.who === activeName)).toBe(false);
			expect(listed.rows.some((row) => row.who === finishedName)).toBe(false);
			expect(backlog?.kind).toBe("backlog");
			expect((backlog?.ageDays ?? 0) >= 3).toBe(true);
			expect(listed.rules[0]?.quietDays).toBe(1);
			try {
				await createReportSchedule(db, {
					actorId: coordinator.userId,
					assignments,
					districtId: district.id,
					intervalDays: 0,
					ip: "127.0.0.1",
				});
				throw new Error("expected a blank interval to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("days");
			}
			await createReportSchedule(db, {
				actorId: coordinator.userId,
				assignments,
				districtId: district.id,
				intervalDays: 1,
				ip: "127.0.0.1",
			});
			const stored = await readReportSchedules(db, assignments);
			expect(stored.schedules[0]?.intervalDays).toBe(1);
			expect(stored.schedules[0]?.districtName).toBe(districtName);
			expect(await sendDueReports(db, new Date())).toBe(0);
			const due = new Date(Date.now() + 2 * DAY_MS);
			expect(await sendDueReports(db, due)).toBe(1);
			expect(await sendDueReports(db, due)).toBe(0);
			const mailed = await db
				.select({
					userId: notifications.userId,
					body: notifications.body,
					channel: notifications.channel,
				})
				.from(notifications)
				.where(
					and(
						eq(notifications.eventName, "report.scheduled"),
						eq(notifications.channel, "email"),
					),
				);
			const recipients = new Set(mailed.map((row) => row.userId));
			expect(recipients.has(coordinator.userId)).toBe(true);
			expect(recipients.has(partner.userId)).toBe(true);
			expect(recipients.has(mentor.userId)).toBe(false);
			expect(recipients.has(quiet.userId)).toBe(false);
			const body = mailed.find(
				(row) => row.userId === coordinator.userId,
			)?.body;
			expect(body?.includes(districtName)).toBe(true);
			expect(body?.includes("Awarded")).toBe(true);
			expect(body?.includes(quietName)).toBe(false);
		}
	}, 120_000);
});
