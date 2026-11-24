import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	allocationRounds,
	committeeDecisions,
	consents,
	districts,
	hardwareGrants,
	hardwareInventory,
	learningCenters,
	pointTransactions,
	provinces,
	rankingSnapshots,
	roles,
	roundApplications,
	sectors,
	userRoles,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import type { Assignment } from "../authz/decide";
import { CONSENT_VERSION } from "../identity/consent";
import { createUserWithPassport } from "../identity/create-user";
import { exportEquity, listBoard, readEquity } from "./equity";

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

function reasonOf(error: unknown): string | null {
	if (
		!isApiError(error) ||
		typeof error.details !== "object" ||
		!error.details
	) {
		return null;
	}
	const reason = (error.details as { reason?: unknown }).reason;
	return typeof reason === "string" ? reason : null;
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe.serial("leaderboard and equity", () => {
	test("the board uses initials, a small group is hidden, and a batch shows where the items went", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const districtName = `Board district ${stamp}`;
		const [role] = await db
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.code, "learner"))
			.limit(1);
		if (!role) throw new Error("the learner role is missing");
		const roleId = role.id;
		const officer = await createUserWithPassport(db, {
			email: `board-officer-${stamp}@demo.ikiraro.test`,
			name: "Board officer",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `bp-${stamp}`, name: `Board province ${stamp}` })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `bd-${stamp}`,
				name: districtName,
			})
			.returning({ id: districts.id });
		const [emptyDistrict] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `be-${stamp}`,
				name: `Empty district ${stamp}`,
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `bs-${stamp}`,
				name: `Board sector ${stamp}`,
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Board center ${stamp}` })
			.returning({ id: learningCenters.id });
		if (!district || !emptyDistrict || !center) {
			throw new Error("the district was not stored");
		}
		const districtId = district.id;
		const centerId = center.id;
		async function learner(input: {
			name: string;
			gender: string | null;
			sectorName: string | null;
			optIn: boolean;
			points: number;
		}) {
			const created = await createUserWithPassport(db, {
				email: `board-${crypto.randomUUID()}@demo.ikiraro.test`,
				name: input.name,
			});
			await db
				.update(users)
				.set({
					centerId,
					gender: input.gender,
					dateOfBirth: "1998-01-01",
					economicSector: input.sectorName,
				})
				.where(eq(users.id, created.userId));
			await db.insert(userRoles).values({
				userId: created.userId,
				roleId,
				scopeType: "self",
				scopeId: String(created.userId),
			});
			await db.insert(consents).values([
				{
					userId: created.userId,
					purpose: "data_use",
					granted: true,
					version: CONSENT_VERSION,
				},
				{
					userId: created.userId,
					purpose: "leaderboard",
					granted: input.optIn,
					version: CONSENT_VERSION,
				},
			]);
			if (input.points > 0) {
				await db.insert(pointTransactions).values({
					userId: created.userId,
					amount: input.points,
					kind: "task_approved",
					referenceType: "submission",
					referenceId: crypto.randomUUID(),
				});
			}
			return created.userId;
		}
		const women: number[] = [];
		for (let index = 0; index < 10; index += 1) {
			women.push(
				await learner({
					name: "Quorum Woman",
					gender: "woman",
					sectorName: "tailoring",
					optIn: true,
					points: 5,
				}),
			);
		}
		for (let index = 0; index < 9; index += 1) {
			await learner({
				name: "Quorum Man",
				gender: "man",
				sectorName: "farming",
				optIn: true,
				points: 5,
			});
		}
		await learner({
			name: "Hidden Person",
			gender: null,
			sectorName: null,
			optIn: false,
			points: 100,
		});
		const recipientId = women[0];
		if (!recipientId) throw new Error("the recipient was not stored");
		const [round] = await db
			.insert(allocationRounds)
			.values({
				districtId,
				title: `Board round ${stamp}`,
				quantity: 1,
				opensAt: new Date(Date.now() - 60_000),
				closesAt: new Date(Date.now() + 86_400_000),
				criteria: [{ kind: "points", minimum: 10 }],
				openedByUserId: officer.userId,
			})
			.returning({ id: allocationRounds.id });
		const [stock] = await db
			.insert(hardwareInventory)
			.values({
				name: "Stock laptop",
				category: "laptop",
				serial: `BOARD-STOCK-${stamp}`,
				condition: "good",
				status: "in_stock",
				centerId,
				donor: "Quorum Donor",
				acquiredOn: "2026-01-02",
				createdByUserId: officer.userId,
			})
			.returning({ id: hardwareInventory.id });
		const [awarded] = await db
			.insert(hardwareInventory)
			.values({
				name: "Awarded laptop",
				category: "laptop",
				serial: `BOARD-AWARD-${stamp}`,
				condition: "good",
				status: "awarded",
				centerId,
				donor: "Quorum Donor",
				acquiredOn: "2026-01-02",
				createdByUserId: officer.userId,
			})
			.returning({ id: hardwareInventory.id });
		if (!round || !stock || !awarded)
			throw new Error("the items were not stored");
		const [application] = await db
			.insert(roundApplications)
			.values({
				roundId: round.id,
				userId: recipientId,
				statement: "I will use it for practice.",
				results: [],
			})
			.returning({ id: roundApplications.id });
		const [snapshot] = await db
			.insert(rankingSnapshots)
			.values({
				roundId: round.id,
				body: {},
				recordedByUserId: officer.userId,
			})
			.returning({ id: rankingSnapshots.id });
		if (!application || !snapshot) throw new Error("the ask was not stored");
		const [decision] = await db
			.insert(committeeDecisions)
			.values({
				roundId: round.id,
				applicationId: application.id,
				snapshotId: snapshot.id,
				decision: "awarded",
				reason: "The committee awarded this item.",
				decidedByUserId: officer.userId,
			})
			.returning({ id: committeeDecisions.id });
		if (!decision) throw new Error("the decision was not stored");
		await db.insert(hardwareGrants).values({
			decisionId: decision.id,
			roundId: round.id,
			applicationId: application.id,
			inventoryId: awarded.id,
			recipientUserId: recipientId,
			approvedByUserId: officer.userId,
			status: "active",
		});
		const board = (await listBoard(db)).filter(
			(row) => row.district === districtName,
		);
		expect(board).toHaveLength(19);
		expect(board.every((row) => row.progress === 50)).toBe(true);
		expect(board.some((row) => row.initials === "HP")).toBe(false);
		expect(
			board.every((row) => row.initials === "QW" || row.initials === "QM"),
		).toBe(true);
		const scoped: Assignment[] = [
			{
				role: "district_coordinator",
				scopeType: "district",
				scopeId: districtId,
			},
		];
		const report = await readEquity(db, scoped);
		expect(report.funnel.registered).toBe(20);
		expect(report.funnel.applicants).toBe(1);
		expect(report.funnel.recipients).toBe(1);
		expect(report.funnel.activeAt90Days).toBe(0);
		expect(report.genders.map((row) => row.label)).toEqual(["woman"]);
		expect(report.sectors.map((row) => row.label)).toEqual(["tailoring"]);
		expect(report.districts.map((row) => row.registered)).toEqual([20]);
		expect(report.ages.map((row) => row.label)).toEqual(["25-34"]);
		const batch = report.batches.find((row) => row.donor === "Quorum Donor");
		expect(batch?.items.map((item) => item.outcome).sort()).toEqual([
			"awarded",
			"in_stock",
		]);
		expect(batch?.items.every((item) => !("recipientName" in item))).toBe(true);
		const elsewhere = await readEquity(db, [
			{
				role: "district_coordinator",
				scopeType: "district",
				scopeId: emptyDistrict.id,
			},
		]);
		expect(elsewhere.funnel.registered).toBe(0);
		expect(elsewhere.batches.some((row) => row.donor === "Quorum Donor")).toBe(
			false,
		);
		const csv = await exportEquity(db, {
			actorId: officer.userId,
			assignments: scoped,
			ip: "127.0.0.1",
		});
		expect(csv.csv.includes("Quorum Donor")).toBe(true);
		expect(csv.csv.includes("@demo.ikiraro.test")).toBe(false);
		try {
			await readEquity(db, [
				{
					role: "trainer",
					scopeType: "center",
					scopeId: centerId,
				},
			]);
			throw new Error("a trainer read the counts");
		} catch (error) {
			expect(reasonOf(error)).toBe("scope");
		}
	}, 120_000);
});
