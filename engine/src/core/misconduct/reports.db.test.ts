import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	centerStaff,
	learningCenters,
	misconductReports,
	sectors,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { readAudit } from "../audit/search";
import { createUserWithPassport } from "../identity/create-user";
import {
	closeConcern,
	fileConcern,
	listConcernQueue,
	readConcern,
} from "./reports";

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

describe("misconduct reports", () => {
	test("staff at the accused center cannot read the concern", async () => {
		if (!suite) return;
		const { db } = suite;
		const [center] = await db
			.select({
				id: learningCenters.id,
				districtId: sectors.districtId,
			})
			.from(learningCenters)
			.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
			.where(eq(learningCenters.name, "Gitega Learning Center"))
			.limit(1);
		expect(center).toBeTruthy();
		if (!center) return;

		const stamp = crypto.randomUUID();
		const reporter = await createUserWithPassport(db, {
			email: `report-${stamp}@demo.ikiraro.test`,
			name: "Reporter",
		});
		await db
			.update(users)
			.set({ centerId: center.id })
			.where(eq(users.id, reporter.userId));
		const staff = await createUserWithPassport(db, {
			email: `staff-${stamp}@demo.ikiraro.test`,
			name: "Center staff",
		});
		await db.insert(centerStaff).values({
			centerId: center.id,
			userId: staff.userId,
			role: "trainer",
		});
		await db
			.update(misconductReports)
			.set({
				status: "closed",
				closedNote: "Closed after a failed test.",
				closedByUserId: reporter.userId,
				closedAt: new Date(),
			})
			.where(
				and(
					eq(misconductReports.status, "open"),
					eq(
						misconductReports.body,
						"A verification concern about this center.",
					),
				),
			);

		const filed = await fileConcern(db, {
			reporterId: reporter.userId,
			centerId: center.id,
			kind: "favoritism",
			body: "A verification concern about this center.",
			ip: "127.0.0.1",
		});

		const reviewer = await createUserWithPassport(db, {
			email: `review-${stamp}@demo.ikiraro.test`,
			name: "Outside reviewer",
		});
		const blocked = {
			userId: staff.userId,
			centerIds: [center.id],
			admin: false,
			districtIds: [center.districtId],
		};
		const outside = {
			userId: reviewer.userId,
			centerIds: [] as string[],
			admin: false,
			districtIds: [center.districtId],
		};
		expect(await listConcernQueue(db, blocked)).toEqual([]);
		let blockedStatus = 0;
		try {
			await readConcern(db, { reportId: filed.id, viewer: blocked });
		} catch (error) {
			if (!isApiError(error)) throw error;
			blockedStatus = error.status;
		}
		expect(blockedStatus).toBe(404);
		const queue = await listConcernQueue(db, outside);
		expect(queue.some((row) => row.id === filed.id)).toBe(true);

		const limited = await readAudit(db, {
			scope: {
				kind: "limited",
				centerIds: [center.id],
				districtIds: [],
			},
			viewerId: reporter.userId,
			filter: { action: "misconduct" },
			limit: 20,
		});
		expect(limited.every((row) => !row.action.startsWith("misconduct."))).toBe(
			true,
		);

		await closeConcern(db, {
			reportId: filed.id,
			viewer: outside,
			note: "Read outside the center.",
			ip: "127.0.0.1",
		});
		let stillBlocked = 0;
		try {
			await readConcern(db, { reportId: filed.id, viewer: blocked });
		} catch (error) {
			if (!isApiError(error)) throw error;
			stillBlocked = error.status;
		}
		expect(stillBlocked).toBe(404);
		const own = await readConcern(db, {
			reportId: filed.id,
			viewer: {
				userId: reporter.userId,
				centerIds: [center.id],
				admin: false,
				districtIds: [],
			},
		});
		expect(own.reporterName).toBeNull();
		expect(own.closedNote).toBe("Read outside the center.");
	}, 90_000);
});
