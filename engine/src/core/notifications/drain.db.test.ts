import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestEnv } from "../../../test/helpers";
import * as schema from "../../db/schema";
import {
	centerStaff,
	contentVersions,
	courses,
	enrollments,
	learningCenters,
	modules,
	notifications,
	roles,
	sectors,
	taskProgress,
	taskSubmissions,
	tasks,
	userRoles,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { writeEvent } from "../audit/write";
import { insertUserWithPassport } from "../identity/create-user";
import type { SmsSender } from "../sms/sender";
import { createAnnouncement } from "./announce";
import { drainNotifications } from "./drain";
import type { EmailSender } from "./email";
import {
	listInbox,
	listNotificationTemplates,
	updateNotificationPreference,
	updateNotificationTemplate,
} from "./inbox";

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

const holdingEmail: EmailSender = {
	async send() {
		return "not_configured";
	},
};

describe("notification outbox", () => {
	test("a failed SMS stays queued, and a second drain does not write the inbox twice", async () => {
		useTestEnv();
		if (!suite) return;
		const database = suite.db;
		const suffix = crypto.randomUUID().slice(0, 8);
		const [sector] = await database
			.select({ id: sectors.id, districtId: sectors.districtId })
			.from(sectors)
			.limit(1);
		const [existing] = await database
			.select({ id: learningCenters.id })
			.from(learningCenters)
			.limit(1);
		if (!sector || !existing) throw new Error("geography is missing");
		const [createdCenter] = await database
			.insert(learningCenters)
			.values({ sectorId: sector.id, name: `Notify ${suffix}` })
			.returning({ id: learningCenters.id });
		if (!createdCenter) throw new Error("center missing");
		const home = { id: createdCenter.id, districtId: sector.districtId };
		const other = existing;
		const phone = `+2507${suffix.replace(/\D/g, "").padEnd(8, "1").slice(0, 8)}`;
		const learner = await insertUserWithPassport(database, {
			email: `notify-learner-${suffix}@example.test`,
			name: "Aline",
			phone,
		});
		const neighbor = await insertUserWithPassport(database, {
			email: `notify-neighbor-${suffix}@example.test`,
			name: "Bob",
		});
		const manager = await insertUserWithPassport(database, {
			email: `notify-manager-${suffix}@example.test`,
			name: "Manager",
		});
		const trainer = await insertUserWithPassport(database, {
			email: `notify-trainer-${suffix}@example.test`,
			name: "Trainer",
		});
		await database
			.update(users)
			.set({ centerId: home.id, locale: "en" })
			.where(eq(users.id, learner.userId));
		await database
			.update(users)
			.set({ centerId: other.id, locale: "en" })
			.where(eq(users.id, neighbor.userId));
		const roleRows = await database
			.select({ id: roles.id, code: roles.code })
			.from(roles);
		const managerRole = roleRows.find((row) => row.code === "center_manager");
		const trainerRole = roleRows.find((row) => row.code === "trainer");
		const coordinatorRole = roleRows.find(
			(row) => row.code === "district_coordinator",
		);
		if (!managerRole || !trainerRole || !coordinatorRole) {
			throw new Error("staff roles are missing");
		}
		await database.insert(userRoles).values([
			{
				userId: manager.userId,
				roleId: managerRole.id,
				scopeType: "center",
				scopeId: home.id,
			},
			{
				userId: trainer.userId,
				roleId: trainerRole.id,
				scopeType: "center",
				scopeId: home.id,
			},
			{
				userId: manager.userId,
				roleId: coordinatorRole.id,
				scopeType: "district",
				scopeId: home.districtId,
			},
		]);
		await database.insert(centerStaff).values({
			centerId: home.id,
			userId: manager.userId,
			role: "center_manager",
		});
		const [course] = await database
			.insert(courses)
			.values({})
			.returning({ id: courses.id });
		if (!course) throw new Error("course missing");
		const [moduleRow] = await database
			.insert(modules)
			.values({ courseId: course.id, position: 0 })
			.returning({ id: modules.id });
		if (!moduleRow) throw new Error("module missing");
		const taskRows = await database
			.insert(tasks)
			.values([
				{ moduleId: moduleRow.id, position: 0, required: true },
				{ moduleId: moduleRow.id, position: 1, required: true },
			])
			.returning({ id: tasks.id });
		const firstTask = taskRows[0];
		const secondTask = taskRows[1];
		if (!firstTask || !secondTask) throw new Error("tasks missing");
		const snapshot = {
			modules: [
				{
					tasks: [
						{ id: firstTask.id, required: true },
						{ id: secondTask.id, required: true },
					],
				},
			],
			badge: {
				rule: {
					allRequiredTasksApproved: true,
					minimumScore: null,
					minimumHours: null,
				},
			},
		};
		const [version] = await database
			.insert(contentVersions)
			.values({ courseId: course.id, versionNumber: 1, snapshot })
			.returning({ id: contentVersions.id });
		if (!version) throw new Error("version missing");
		const [enrollment] = await database
			.insert(enrollments)
			.values({
				userId: learner.userId,
				courseId: course.id,
				contentVersionId: version.id,
				centerId: home.id,
			})
			.returning({ id: enrollments.id });
		if (!enrollment) throw new Error("enrollment missing");
		const [quietCourse] = await database
			.insert(courses)
			.values({})
			.returning({ id: courses.id });
		if (!quietCourse) throw new Error("quiet course missing");
		const [quietVersion] = await database
			.insert(contentVersions)
			.values({
				courseId: quietCourse.id,
				versionNumber: 1,
				snapshot,
			})
			.returning({ id: contentVersions.id });
		if (!quietVersion) throw new Error("quiet version missing");
		await database.insert(enrollments).values({
			userId: neighbor.userId,
			courseId: quietCourse.id,
			contentVersionId: quietVersion.id,
			centerId: other.id,
		});
		const submissionId = crypto.randomUUID();
		await database.insert(taskSubmissions).values({
			id: submissionId,
			enrollmentId: enrollment.id,
			taskId: firstTask.id,
			contentVersionId: version.id,
			ownerUserId: learner.userId,
			attempt: 1,
			status: "pending",
			evidenceType: "note",
			note: "A note.",
		});
		const submissionEvent = await writeEvent(database, {
			name: "submission.created",
			payload: { submissionId },
		});
		const quiet = { eventIds: [submissionEvent], sweepStalled: false };
		const sms: SmsSender = {
			async send() {},
		};
		const failingSms: SmsSender = {
			async send(message) {
				if (message.to === phone) throw new Error("gateway down");
			},
		};
		await drainNotifications(
			database,
			{ sms: failingSms, email: holdingEmail },
			quiet,
		);
		const firstInbox = await listInbox(database, learner.userId);
		const received = firstInbox.filter(
			(item) => item.eventName === "submission.created",
		);
		expect(received).toHaveLength(1);
		expect(received[0]?.body).toBe(
			"Evidence was received and is waiting for review.",
		);
		expect(received[0]?.sms).toBe("queued");
		const smsRows = await database
			.select({
				attempts: notifications.attempts,
				status: notifications.status,
			})
			.from(notifications)
			.where(
				and(
					eq(notifications.userId, learner.userId),
					eq(notifications.eventName, "submission.created"),
					eq(notifications.channel, "sms"),
				),
			);
		expect(smsRows).toHaveLength(1);
		expect(smsRows[0]?.attempts).toBe(1);
		expect(smsRows[0]?.status).toBe("queued");
		await drainNotifications(database, { sms, email: holdingEmail }, quiet);
		const secondInbox = await listInbox(database, learner.userId);
		expect(
			secondInbox.filter((item) => item.eventName === "submission.created"),
		).toHaveLength(1);
		expect(
			secondInbox.find((item) => item.eventName === "submission.created")?.sms,
		).toBe("sent");
		await updateNotificationPreference(database, {
			userId: learner.userId,
			eventName: "badge.awarded",
			channel: "sms",
			enabled: false,
		});
		const badgeEvent = await writeEvent(database, {
			name: "badge.awarded",
			payload: { userId: learner.userId },
		});
		await drainNotifications(
			database,
			{ sms, email: holdingEmail },
			{ eventIds: [badgeEvent], sweepStalled: false },
		);
		const badgeSms = await database
			.select({ id: notifications.id })
			.from(notifications)
			.where(
				and(
					eq(notifications.userId, learner.userId),
					eq(notifications.eventName, "badge.awarded"),
					eq(notifications.channel, "sms"),
				),
			);
		expect(badgeSms).toHaveLength(0);
		const templates = await listNotificationTemplates(database);
		const grantTemplate = templates.find(
			(item) =>
				item.eventName === "grant.decided" &&
				item.channel === "in_app" &&
				item.locale === "en",
		);
		if (!grantTemplate) throw new Error("grant template missing");
		await updateNotificationTemplate(database, {
			id: grantTemplate.id,
			actorId: manager.userId,
			title: "Grant decision",
			body: "The grant decision is ready.",
			ip: "127.0.0.1",
		});
		await updateNotificationPreference(database, {
			userId: learner.userId,
			eventName: "grant.decided",
			channel: "email",
			enabled: true,
		});
		const grantEvent = await writeEvent(database, {
			name: "grant.decided",
			payload: { userId: learner.userId },
		});
		const followEvent = await writeEvent(database, {
			name: "follow_up.due",
			payload: { userId: learner.userId },
		});
		await drainNotifications(
			database,
			{ sms, email: holdingEmail },
			{ eventIds: [grantEvent, followEvent], sweepStalled: false },
		);
		const afterGrant = await listInbox(database, learner.userId);
		expect(
			afterGrant.find((item) => item.eventName === "grant.decided")?.body,
		).toBe("The grant decision is ready.");
		expect(
			afterGrant.find((item) => item.eventName === "grant.decided")?.email,
		).toBe("queued");
		expect(
			afterGrant.find((item) => item.eventName === "follow_up.due")?.body,
		).toBe("A follow-up is due.");
		const emailRow = await database
			.select({
				attempts: notifications.attempts,
				lastError: notifications.lastError,
				status: notifications.status,
			})
			.from(notifications)
			.where(
				and(
					eq(notifications.userId, learner.userId),
					eq(notifications.eventName, "grant.decided"),
					eq(notifications.channel, "email"),
				),
			);
		expect(emailRow[0]?.status).toBe("queued");
		expect(emailRow[0]?.attempts).toBe(0);
		expect(emailRow[0]?.lastError).toBe("email_not_configured");
		await drainNotifications(
			database,
			{ sms, email: holdingEmail },
			{ eventIds: [grantEvent], sweepStalled: false },
		);
		const emailAgain = await database
			.select({ attempts: notifications.attempts })
			.from(notifications)
			.where(
				and(
					eq(notifications.userId, learner.userId),
					eq(notifications.eventName, "grant.decided"),
					eq(notifications.channel, "email"),
				),
			);
		expect(emailAgain).toHaveLength(1);
		expect(emailAgain[0]?.attempts).toBe(0);
		expect(
			await statusOf(() =>
				createAnnouncement(database, {
					actorId: trainer.userId,
					scope: "center",
					scopeId: home.id,
					title: "Closed today",
					body: "The center is closed this afternoon.",
					ip: "127.0.0.1",
				}),
			),
		).toBe(403);
		const announcement = await createAnnouncement(database, {
			actorId: manager.userId,
			scope: "center",
			scopeId: home.id,
			title: "Closed today",
			body: "The center is closed this afternoon.",
			ip: "127.0.0.1",
		});
		await drainNotifications(
			database,
			{ sms, email: holdingEmail },
			{ eventIds: [announcement.id], sweepStalled: false },
		);
		const homeInbox = await listInbox(database, learner.userId);
		const neighborInbox = await listInbox(database, neighbor.userId);
		expect(
			homeInbox.find((item) => item.eventName === "announcement.posted")?.body,
		).toBe("The center is closed this afternoon.");
		expect(
			neighborInbox.find((item) => item.eventName === "announcement.posted"),
		).toBeUndefined();
		await database.insert(taskProgress).values({
			enrollmentId: enrollment.id,
			taskId: firstTask.id,
			status: "complete",
		});
		await drainNotifications(
			database,
			{ sms, email: holdingEmail },
			{ eventIds: [], sweepStalled: true },
		);
		const reminded = await listInbox(database, learner.userId);
		const stalled = reminded.filter(
			(item) => item.eventName === "learner.stalled",
		);
		expect(stalled).toHaveLength(1);
		expect(stalled[0]?.body).toBe("You are one task from your badge.");
		const neighborStalled = await database
			.select({ id: notifications.id })
			.from(notifications)
			.where(
				and(
					eq(notifications.userId, neighbor.userId),
					eq(notifications.eventName, "learner.stalled"),
				),
			);
		expect(neighborStalled).toHaveLength(0);
		await drainNotifications(
			database,
			{ sms, email: holdingEmail },
			{ eventIds: [], sweepStalled: true },
		);
		const remindedAgain = await listInbox(database, learner.userId);
		expect(
			remindedAgain.filter((item) => item.eventName === "learner.stalled"),
		).toHaveLength(1);
	}, 90_000);
});
