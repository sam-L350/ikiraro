import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	centerSessions,
	centerStaff,
	contentVersions,
	courses,
	courseTranslations,
	digitalPassports,
	districts,
	enrollments,
	learningCenters,
	provinces,
	roles,
	sectors,
	userRoles,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import {
	checkInToSession,
	countAttendedSessions,
	createCenterSession,
	listLearnerSchedule,
	markSessionAttendance,
} from "./center-sessions";
import { evaluateEligibility } from "./eligibility";

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

function reasonOf(error: unknown): string | null {
	if (!isApiError(error)) return null;
	const details = error.details;
	if (
		details &&
		typeof details === "object" &&
		"reason" in details &&
		typeof details.reason === "string"
	) {
		return details.reason;
	}
	return null;
}

async function expectStatus(
	run: () => Promise<unknown>,
	status: number,
	reason?: string,
): Promise<void> {
	try {
		await run();
	} catch (error) {
		if (!isApiError(error)) throw error;
		expect(error.status).toBe(status);
		if (reason) expect(reasonOf(error)).toBe(reason);
		return;
	}
	throw new Error(`expected status ${status}`);
}

async function minutesOf(
	db: NonNullable<typeof suite>["db"],
	userId: number,
): Promise<number> {
	const [row] = await db
		.select({ minutes: digitalPassports.verifiedMinutes })
		.from(digitalPassports)
		.where(eq(digitalPassports.userId, userId))
		.limit(1);
	return row?.minutes ?? -1;
}

describe.serial("center sessions", () => {
	test("attendance adds verified minutes once", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const trainer = await createUserWithPassport(db, {
			email: `session-${stamp}-trainer@demo.ikiraro.test`,
			name: "Session trainer",
		});
		const other = await createUserWithPassport(db, {
			email: `session-${stamp}-other@demo.ikiraro.test`,
			name: "Session other trainer",
		});
		const manager = await createUserWithPassport(db, {
			email: `session-${stamp}-manager@demo.ikiraro.test`,
			name: "Session manager",
		});
		const learner = await createUserWithPassport(db, {
			email: `session-${stamp}-a@demo.ikiraro.test`,
			name: "Session learner",
		});
		const second = await createUserWithPassport(db, {
			email: `session-${stamp}-b@demo.ikiraro.test`,
			name: "Session second learner",
		});
		const visitor = await createUserWithPassport(db, {
			email: `session-${stamp}-visit@demo.ikiraro.test`,
			name: "Session visitor",
		});
		const outsider = await createUserWithPassport(db, {
			email: `session-${stamp}-out@demo.ikiraro.test`,
			name: "Session outsider",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `sp-${stamp}`, name: "Session province" })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `sd-${stamp}`,
				name: "Session district",
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `ss-${stamp}`,
				name: "Session sector",
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Session center ${stamp}` })
			.returning({ id: learningCenters.id });
		const [elsewhere] = await db
			.insert(learningCenters)
			.values({
				sectorId: sector?.id ?? "",
				name: `Session elsewhere ${stamp}`,
			})
			.returning({ id: learningCenters.id });
		const [course] = await db
			.insert(courses)
			.values({ status: "published", createdByUserId: trainer.userId })
			.returning({ id: courses.id });
		const [version] = await db
			.insert(contentVersions)
			.values({
				courseId: course?.id ?? "",
				versionNumber: 1,
				snapshot: {},
			})
			.returning({ id: contentVersions.id });
		if (!center || !elsewhere || !course || !version) {
			throw new Error("the center was not stored");
		}
		await db.insert(courseTranslations).values({
			courseId: course.id,
			locale: "en",
			title: "Session course",
		});
		await db
			.update(users)
			.set({ centerId: center.id })
			.where(eq(users.id, learner.userId));
		await db
			.update(users)
			.set({ centerId: center.id })
			.where(eq(users.id, second.userId));
		await db
			.update(users)
			.set({ centerId: elsewhere.id })
			.where(eq(users.id, visitor.userId));
		await db.insert(enrollments).values({
			userId: visitor.userId,
			courseId: course.id,
			contentVersionId: version.id,
			centerId: center.id,
		});
		const roleRows = await db
			.select({ id: roles.id, code: roles.code })
			.from(roles);
		const trainerRole = roleRows.find((role) => role.code === "trainer");
		const managerRole = roleRows.find((role) => role.code === "center_manager");
		if (!trainerRole || !managerRole) {
			throw new Error("staff roles were not found");
		}
		await db.insert(userRoles).values([
			{
				userId: trainer.userId,
				roleId: trainerRole.id,
				scopeType: "center",
				scopeId: center.id,
			},
			{
				userId: other.userId,
				roleId: trainerRole.id,
				scopeType: "center",
				scopeId: center.id,
			},
			{
				userId: manager.userId,
				roleId: managerRole.id,
				scopeType: "center",
				scopeId: center.id,
			},
		]);
		await db.insert(centerStaff).values([
			{ centerId: center.id, userId: trainer.userId, role: "trainer" },
			{ centerId: center.id, userId: other.userId, role: "trainer" },
			{
				centerId: center.id,
				userId: manager.userId,
				role: "center_manager",
			},
		]);
		const openAt = new Date(Date.now() - 60_000).toISOString();
		const created = await createCenterSession(db, {
			actorId: trainer.userId,
			centerId: center.id,
			topic: "Morning practice",
			courseId: course.id,
			trainerUserId: trainer.userId,
			startsAt: openAt,
			minutes: 30,
			capacity: 2,
			ip: "127.0.0.1",
		});
		const before = await minutesOf(db, learner.userId);
		const attendanceId = crypto.randomUUID();
		const marked = await markSessionAttendance(db, {
			actorId: trainer.userId,
			sessionId: created.id,
			learnerId: learner.userId,
			attendanceId,
			ip: "127.0.0.1",
		});
		expect(marked.minutes).toBe(30);
		expect(await minutesOf(db, learner.userId)).toBe(before + 30);
		const again = await markSessionAttendance(db, {
			actorId: trainer.userId,
			sessionId: created.id,
			learnerId: learner.userId,
			attendanceId,
			ip: "127.0.0.1",
		});
		expect(again.id).toBe(attendanceId);
		expect(await minutesOf(db, learner.userId)).toBe(before + 30);
		await expectStatus(
			() =>
				markSessionAttendance(db, {
					actorId: trainer.userId,
					sessionId: created.id,
					learnerId: learner.userId,
					attendanceId: crypto.randomUUID(),
					ip: "127.0.0.1",
				}),
			409,
			"duplicate",
		);
		expect(await minutesOf(db, learner.userId)).toBe(before + 30);
		await expectStatus(
			() =>
				markSessionAttendance(db, {
					actorId: other.userId,
					sessionId: created.id,
					learnerId: second.userId,
					attendanceId: crypto.randomUUID(),
					ip: "127.0.0.1",
				}),
			403,
		);
		await expectStatus(
			() =>
				markSessionAttendance(db, {
					actorId: trainer.userId,
					sessionId: created.id,
					learnerId: outsider.userId,
					attendanceId: crypto.randomUUID(),
					ip: "127.0.0.1",
				}),
			404,
		);
		const visitBefore = await minutesOf(db, visitor.userId);
		await markSessionAttendance(db, {
			actorId: trainer.userId,
			sessionId: created.id,
			learnerId: visitor.userId,
			attendanceId: crypto.randomUUID(),
			ip: "127.0.0.1",
		});
		expect(await minutesOf(db, visitor.userId)).toBe(visitBefore + 30);
		await expectStatus(
			() =>
				markSessionAttendance(db, {
					actorId: trainer.userId,
					sessionId: created.id,
					learnerId: second.userId,
					attendanceId: crypto.randomUUID(),
					ip: "127.0.0.1",
				}),
			409,
			"full",
		);
		const future = await createCenterSession(db, {
			actorId: trainer.userId,
			centerId: center.id,
			topic: "Later practice",
			trainerUserId: trainer.userId,
			startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
			minutes: 30,
			capacity: 2,
			ip: "127.0.0.1",
		});
		await expectStatus(
			() =>
				markSessionAttendance(db, {
					actorId: trainer.userId,
					sessionId: future.id,
					learnerId: second.userId,
					attendanceId: crypto.randomUUID(),
					ip: "127.0.0.1",
				}),
			409,
			"window",
		);
		const cancelled = await createCenterSession(db, {
			actorId: trainer.userId,
			centerId: center.id,
			topic: "Cancelled practice",
			trainerUserId: trainer.userId,
			startsAt: openAt,
			minutes: 30,
			capacity: 2,
			ip: "127.0.0.1",
		});
		await db
			.update(centerSessions)
			.set({ cancelledAt: new Date() })
			.where(eq(centerSessions.id, cancelled.id));
		await expectStatus(
			() =>
				markSessionAttendance(db, {
					actorId: trainer.userId,
					sessionId: cancelled.id,
					learnerId: second.userId,
					attendanceId: crypto.randomUUID(),
					ip: "127.0.0.1",
				}),
			409,
			"window",
		);
		const qr = await createCenterSession(db, {
			actorId: manager.userId,
			centerId: center.id,
			topic: "Check-in practice",
			trainerUserId: trainer.userId,
			startsAt: openAt,
			minutes: 45,
			capacity: 1,
			ip: "127.0.0.1",
		});
		const [tokenRow] = await db
			.select({ token: centerSessions.checkInToken })
			.from(centerSessions)
			.where(eq(centerSessions.id, qr.id))
			.limit(1);
		const token = tokenRow?.token ?? "";
		const qrId = crypto.randomUUID();
		const checked = await checkInToSession(db, {
			learnerId: learner.userId,
			token,
			attendanceId: qrId,
			ip: "127.0.0.1",
		});
		expect(checked.method).toBe("qr");
		expect(checked.minutes).toBe(45);
		expect(await minutesOf(db, learner.userId)).toBe(before + 75);
		const checkedAgain = await checkInToSession(db, {
			learnerId: learner.userId,
			token,
			attendanceId: qrId,
			ip: "127.0.0.1",
		});
		expect(checkedAgain.id).toBe(qrId);
		expect(await minutesOf(db, learner.userId)).toBe(before + 75);
		await expectStatus(
			() =>
				checkInToSession(db, {
					learnerId: outsider.userId,
					token,
					attendanceId: crypto.randomUUID(),
					ip: "127.0.0.1",
				}),
			404,
		);
		const managed = await createCenterSession(db, {
			actorId: manager.userId,
			centerId: center.id,
			topic: "Manager practice",
			trainerUserId: trainer.userId,
			startsAt: openAt,
			minutes: 15,
			capacity: 1,
			ip: "127.0.0.1",
		});
		const secondBefore = await minutesOf(db, second.userId);
		await markSessionAttendance(db, {
			actorId: manager.userId,
			sessionId: managed.id,
			learnerId: second.userId,
			attendanceId: crypto.randomUUID(),
			ip: "127.0.0.1",
		});
		expect(await minutesOf(db, second.userId)).toBe(secondBefore + 15);
		const attended = await countAttendedSessions(db, learner.userId);
		expect(attended).toBe(2);
		const decision = evaluateEligibility(
			{
				points: 0,
				badgeIds: [],
				verifiedMinutes: before + 75,
				attendedSessions: attended,
				districtId: null,
				registeredAt: new Date(),
				asOf: new Date(),
			},
			[{ kind: "attendance", minimum: 2 }],
		);
		expect(decision[0]?.status).toBe("pass");
		const schedule = await listLearnerSchedule(db, {
			learnerId: learner.userId,
		});
		expect(
			schedule.items.some((item) => item.topic === "Morning practice"),
		).toBe(true);
		const home = schedule.items.find((item) => item.id === created.id);
		expect(home?.attended).toBe(true);
		expect(home?.courseTitleEn).toBe("Session course");
		const empty = await listLearnerSchedule(db, {
			learnerId: outsider.userId,
		});
		expect(empty.items).toEqual([]);
	}, 90_000);
});
