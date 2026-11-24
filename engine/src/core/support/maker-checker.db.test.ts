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
	districts,
	learningCenters,
	mediaObjects,
	provinces,
	roles,
	sectors,
	userRoles,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import {
	approveRoleChange,
	declineRoleChange,
	requestRoleChange,
} from "./approvals";
import { listHelpGuides, publishHelpGuide } from "./guides";
import { answerTicket, fileTicket, listTickets } from "./tickets";

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

function digest(): string {
	return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe.serial("maker-checker and support", () => {
	test("a second admin adds the roles, and a report keeps its first answer time", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const db = suite.db;
		const stamp = Date.now().toString(36);
		const title = `Guide ${stamp}`;
		const technical = `Technical ${stamp}`;
		const content = `Content ${stamp}`;
		const conduct = `Conduct ${stamp}`;
		const maker = await createUserWithPassport(db, {
			email: `maker-${stamp}@demo.ikiraro.test`,
			name: "Maker",
		});
		const checker = await createUserWithPassport(db, {
			email: `checker-${stamp}@demo.ikiraro.test`,
			name: "Checker",
		});
		const reviewer = await createUserWithPassport(db, {
			email: `reviewer-${stamp}@demo.ikiraro.test`,
			name: "Reviewer",
		});
		const first = await createUserWithPassport(db, {
			email: `person-a-${stamp}@demo.ikiraro.test`,
			name: "Person A",
		});
		const second = await createUserWithPassport(db, {
			email: `person-b-${stamp}@demo.ikiraro.test`,
			name: "Person B",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `ap-${stamp}`, name: "Approval province" })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `ad-${stamp}`,
				name: "Approval district",
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `as-${stamp}`,
				name: "Approval sector",
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Approval center ${stamp}` })
			.returning({ id: learningCenters.id });
		if (!center) throw new Error("The center was not stored.");
		const roleRows = await db
			.select({ id: roles.id, code: roles.code })
			.from(roles);
		const roleId = (code: string) => {
			const row = roleRows.find((item) => item.code === code);
			if (!row) throw new Error("A role was not found.");
			return row.id;
		};
		await db.insert(userRoles).values([
			{
				userId: maker.userId,
				roleId: roleId("platform_admin"),
				scopeType: "global",
				scopeId: "global",
			},
			{
				userId: checker.userId,
				roleId: roleId("platform_admin"),
				scopeType: "global",
				scopeId: "global",
			},
			{
				userId: reviewer.userId,
				roleId: roleId("content_reviewer"),
				scopeType: "global",
				scopeId: "global",
			},
		]);
		const one = {
			email: `person-a-${stamp}@demo.ikiraro.test`,
			role: "trainer",
			scopeType: "center",
			scopeId: center.id,
		};
		const people = [
			one,
			{
				email: `person-b-${stamp}@demo.ikiraro.test`,
				role: "trainer",
				scopeType: "center",
				scopeId: center.id,
			},
		];
		try {
			await requestRoleChange(db, {
				actorId: maker.userId,
				reason: " ",
				changes: people,
				ip: "127.0.0.1",
			});
			throw new Error("expected a blank reason to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(400);
			expect(reasonOf(error)).toBe("reason");
		}
		try {
			await requestRoleChange(db, {
				actorId: maker.userId,
				reason: "One person is not a bulk change.",
				changes: [one],
				ip: "127.0.0.1",
			});
			throw new Error("expected one person to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(400);
			expect(reasonOf(error)).toBe("count");
		}
		const asked = await requestRoleChange(db, {
			actorId: maker.userId,
			reason: "Both people teach at this center.",
			changes: people,
			ip: "127.0.0.1",
		});
		try {
			await approveRoleChange(db, {
				actorId: maker.userId,
				approvalId: asked.id,
				ip: "127.0.0.1",
			});
			throw new Error("expected the proposer to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(403);
			expect(reasonOf(error)).toBe("self");
		}
		await approveRoleChange(db, {
			actorId: checker.userId,
			approvalId: asked.id,
			ip: "127.0.0.1",
		});
		try {
			await approveRoleChange(db, {
				actorId: checker.userId,
				approvalId: asked.id,
				ip: "127.0.0.1",
			});
			throw new Error("expected a decided request to stay decided");
		} catch (error) {
			expect(statusOf(error)).toBe(409);
			expect(reasonOf(error)).toBe("closed");
		}
		const granted = await db
			.select({ userId: userRoles.userId, code: roles.code })
			.from(userRoles)
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(eq(roles.code, "trainer"));
		expect(granted.some((row) => row.userId === first.userId)).toBe(true);
		expect(granted.some((row) => row.userId === second.userId)).toBe(true);
		const staff = await db
			.select({ userId: centerStaff.userId })
			.from(centerStaff)
			.where(eq(centerStaff.centerId, center.id));
		expect(staff.some((row) => row.userId === first.userId)).toBe(true);
		expect(staff.some((row) => row.userId === second.userId)).toBe(true);

		const refused = await requestRoleChange(db, {
			actorId: maker.userId,
			reason: "These two should not write courses.",
			changes: people.map((person) => ({
				...person,
				role: "content_author",
				scopeType: "global",
				scopeId: "global",
			})),
			ip: "127.0.0.1",
		});
		await declineRoleChange(db, {
			actorId: checker.userId,
			approvalId: refused.id,
			note: "They teach. They do not write the course.",
			ip: "127.0.0.1",
		});
		const authors = await db
			.select({ userId: userRoles.userId })
			.from(userRoles)
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(eq(roles.code, "content_author"));
		expect(authors.some((row) => row.userId === first.userId)).toBe(false);
		expect(authors.some((row) => row.userId === second.userId)).toBe(false);

		const [audio] = await db
			.insert(mediaObjects)
			.values({
				ownerUserId: maker.userId,
				objectKey: `evidence/${crypto.randomUUID()}`,
				contentType: "audio/mpeg",
				declaredBytes: 4,
				sizeBytes: 4,
				sha256: digest(),
				status: "ready",
				finalizedAt: new Date(),
			})
			.returning({ id: mediaObjects.id });
		if (!audio) throw new Error("The audio was not stored.");
		try {
			await publishHelpGuide(db, {
				actorId: maker.userId,
				titleEn: title,
				titleRw: title,
				bodyEn: "How to review.",
				bodyRw: "Uko usuzuma.",
				walkthrough: "audio",
				ip: "127.0.0.1",
			});
			throw new Error("expected a walkthrough without a file to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(400);
			expect(reasonOf(error)).toBe("media");
		}
		await publishHelpGuide(db, {
			actorId: maker.userId,
			titleEn: title,
			titleRw: title,
			bodyEn: "How to review.",
			bodyRw: "Uko usuzuma.",
			walkthrough: "audio",
			mediaId: audio.id,
			ip: "127.0.0.1",
		});
		const found = await listHelpGuides(db, { userId: first.userId, q: title });
		expect(found.canWrite).toBe(false);
		expect(found.guides.some((guide) => guide.walkthrough === "audio")).toBe(
			true,
		);
		const writer = await listHelpGuides(db, { userId: maker.userId, q: title });
		expect(writer.canWrite).toBe(true);

		const [photo] = await db
			.insert(mediaObjects)
			.values({
				ownerUserId: first.userId,
				objectKey: `evidence/${crypto.randomUUID()}`,
				contentType: "image/jpeg",
				declaredBytes: 4,
				status: "pending",
			})
			.returning({ id: mediaObjects.id });
		if (!photo) throw new Error("The photo was not stored.");
		try {
			await fileTicket(db, {
				actorId: first.userId,
				kind: "technical",
				body: technical,
				mediaId: photo.id,
				ip: "127.0.0.1",
			});
			throw new Error("expected a photo that is not ready to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(409);
			expect(reasonOf(error)).toBe("photo");
		}
		try {
			await fileTicket(db, {
				actorId: first.userId,
				kind: "technical",
				body: " ",
				ip: "127.0.0.1",
			});
			throw new Error("expected a blank report to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(400);
			expect(reasonOf(error)).toBe("body");
		}
		const filed = await fileTicket(db, {
			actorId: first.userId,
			kind: "technical",
			body: technical,
			ip: "127.0.0.1",
		});
		await fileTicket(db, {
			actorId: first.userId,
			kind: "content",
			body: content,
			ip: "127.0.0.1",
		});
		await fileTicket(db, {
			actorId: first.userId,
			kind: "conduct",
			body: conduct,
			ip: "127.0.0.1",
		});
		const reviewerQueue = await listTickets(db, reviewer.userId);
		expect(reviewerQueue.canAnswer).toBe(true);
		expect(reviewerQueue.queue.some((item) => item.body === technical)).toBe(
			false,
		);
		expect(reviewerQueue.queue.some((item) => item.body === conduct)).toBe(
			false,
		);
		expect(reviewerQueue.queue.some((item) => item.body === content)).toBe(
			true,
		);
		const adminQueue = await listTickets(db, checker.userId);
		expect(adminQueue.queue.some((item) => item.body === technical)).toBe(true);
		expect(adminQueue.queue.some((item) => item.body === conduct)).toBe(true);
		const answered = await answerTicket(db, {
			actorId: checker.userId,
			ticketId: filed.id,
			note: "Try again after the photo finishes.",
			ip: "127.0.0.1",
		});
		expect(answered.minutes).toBeGreaterThanOrEqual(0);
		await answerTicket(db, {
			actorId: checker.userId,
			ticketId: filed.id,
			note: "The first time stays.",
			ip: "127.0.0.1",
		});
		const own = await listTickets(db, first.userId);
		const stored = own.mine.find((item) => item.body === technical);
		expect(stored?.minutes).toBe(answered.minutes);
		expect(stored?.status).toBe("answered");
	}, 120_000);
});
