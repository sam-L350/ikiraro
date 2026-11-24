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
	districts,
	followUps,
	hardwareGrants,
	hardwareInventory,
	learningCenters,
	outcomeSurveys,
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
import { createUserWithPassport } from "../identity/create-user";
import { exportDonorReport, readDonorReport } from "./donor";

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

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe.serial("donor reports", () => {
	test("the pack counts decisions and outcomes and leaves personal data out", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const database = suite.db;
		const stamp = Date.now().toString(36);
		const phone = `+2507${Date.now()}`;
		const village = `village-${stamp}`;
		const reason = `private-reason-${stamp}`;
		const purpose = `private-purpose-${stamp}`;
		const statement = `private-statement-${stamp}`;
		const shownName = `Shown ${stamp}`;
		const quietName = `Quiet ${stamp}`;
		const officer = await createUserWithPassport(database, {
			email: `donor-officer-${stamp}@demo.ikiraro.test`,
			name: "Officer",
		});
		const recipient = await createUserWithPassport(database, {
			email: `donor-learner-${stamp}@demo.ikiraro.test`,
			name: "Learner",
			phone,
		});
		const [province] = await database
			.insert(provinces)
			.values({ code: `dp-${stamp}`, name: "Province" })
			.returning({ id: provinces.id });
		const [shown] = await database
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `dd-${stamp}`,
				name: shownName,
			})
			.returning({ id: districts.id });
		const [quiet] = await database
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `dq-${stamp}`,
				name: quietName,
			})
			.returning({ id: districts.id });
		const [sector] = await database
			.insert(sectors)
			.values({
				districtId: shown?.id ?? "",
				code: `ds-${stamp}`,
				name: "Sector",
			})
			.returning({ id: sectors.id });
		const [center] = await database
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Donor ${stamp}` })
			.returning({ id: learningCenters.id });
		const [learnerRole] = await database
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.code, "learner"))
			.limit(1);
		if (!province || !shown || !quiet || !sector || !center || !learnerRole) {
			throw new Error("the district was not stored");
		}
		await database
			.update(users)
			.set({ centerId: center.id, village })
			.where(eq(users.id, recipient.userId));
		await database.insert(userRoles).values({
			userId: recipient.userId,
			roleId: learnerRole.id,
			scopeType: "self",
			scopeId: String(recipient.userId),
		});

		async function person(): Promise<number> {
			const created = await createUserWithPassport(database, {
				email: `donor-ask-${crypto.randomUUID().slice(0, 8)}@demo.ikiraro.test`,
				name: "Asker",
			});
			return created.userId;
		}

		async function roundFor(districtId: string) {
			const [round] = await database
				.insert(allocationRounds)
				.values({
					districtId,
					title: `Donor round ${crypto.randomUUID().slice(0, 8)}`,
					quantity: 1,
					opensAt: new Date(Date.now() - 60_000),
					closesAt: new Date(Date.now() + 86_400_000),
					openedByUserId: officer.userId,
				})
				.returning({ id: allocationRounds.id });
			const [snapshot] = await database
				.insert(rankingSnapshots)
				.values({
					roundId: round?.id ?? "",
					body: {},
					recordedByUserId: officer.userId,
				})
				.returning({ id: rankingSnapshots.id });
			if (!round || !snapshot) throw new Error("the round was not stored");
			return { roundId: round.id, snapshotId: snapshot.id };
		}

		async function decide(
			roundId: string,
			snapshotId: string,
			userId: number,
			decision: "awarded" | "declined",
		) {
			const [application] = await database
				.insert(roundApplications)
				.values({
					roundId,
					userId,
					statement,
					results: [],
				})
				.returning({ id: roundApplications.id });
			if (!application) throw new Error("the ask was not stored");
			const [row] = await database
				.insert(committeeDecisions)
				.values({
					roundId,
					applicationId: application.id,
					snapshotId,
					decision,
					reason,
					decidedByUserId: officer.userId,
				})
				.returning({ id: committeeDecisions.id });
			if (!row) throw new Error("the decision was not stored");
			return { decisionId: row.id, applicationId: application.id };
		}

		const main = await roundFor(shown.id);
		const awarded = await decide(
			main.roundId,
			main.snapshotId,
			recipient.userId,
			"awarded",
		);
		for (let index = 0; index < 9; index += 1) {
			await decide(main.roundId, main.snapshotId, await person(), "declined");
		}
		const other = await roundFor(quiet.id);
		await decide(other.roundId, other.snapshotId, await person(), "declined");

		const [item] = await database
			.insert(hardwareInventory)
			.values({
				name: "Awarded laptop",
				category: "laptop",
				serial: `DONOR-${stamp}`,
				condition: "good",
				status: "awarded",
				centerId: center.id,
				donor: `Donor ${stamp}`,
				acquiredOn: "2026-01-02",
				createdByUserId: officer.userId,
			})
			.returning({ id: hardwareInventory.id });
		if (!item) throw new Error("the item was not stored");
		const [grant] = await database
			.insert(hardwareGrants)
			.values({
				decisionId: awarded.decisionId,
				roundId: main.roundId,
				applicationId: awarded.applicationId,
				inventoryId: item.id,
				recipientUserId: recipient.userId,
				approvedByUserId: officer.userId,
				status: "active",
			})
			.returning({ id: hardwareGrants.id });
		if (!grant) throw new Error("the grant was not stored");
		await database.insert(followUps).values({
			grantId: grant.id,
			day: 30,
			dueOn: "2026-02-01",
			askedAt: new Date(),
			inUse: true,
			purpose,
			answeredAt: new Date(),
			response: "answered",
		});
		await database.insert(outcomeSurveys).values([
			{
				userId: recipient.userId,
				kind: "baseline",
				digitalConfidence: 2,
				tasksDigital: 3,
				income: 424242,
				services: "practice",
				jobsOrCustomers: 1,
			},
			{
				userId: recipient.userId,
				kind: "endline",
				digitalConfidence: 4,
				tasksDigital: 5,
				income: 424343,
				services: "practice",
				jobsOrCustomers: 2,
			},
		]);

		const scoped: Assignment[] = [
			{
				role: "district_coordinator",
				scopeType: "district",
				scopeId: shown.id,
			},
		];
		const report = await readDonorReport(database, scoped);
		expect(report.totals.awarded).toBe(1);
		expect(report.totals.declined).toBe(9);
		expect(report.totals.inUse).toBe(1);
		expect(report.totals.baselines).toBe(1);
		expect(report.totals.endlines).toBe(1);
		expect(report.decisions).toEqual([
			{ district: shownName, awarded: 1, declined: 9 },
		]);
		expect(report.outcome).toBeNull();
		expect(report.batches.map((row) => row.day30)).toEqual(["in_use"]);
		expect(report.batches.some((row) => row.serial === `DONOR-${stamp}`)).toBe(
			true,
		);

		const quietReport = await readDonorReport(database, [
			{
				role: "district_coordinator",
				scopeType: "district",
				scopeId: quiet.id,
			},
		]);
		expect(quietReport.totals.declined).toBe(1);
		expect(quietReport.totals.awarded).toBe(0);
		expect(quietReport.decisions).toEqual([]);
		expect(quietReport.batches).toEqual([]);

		const csv = await exportDonorReport(database, {
			actorId: officer.userId,
			assignments: scoped,
			ip: "127.0.0.1",
		});
		expect(csv.csv.includes(shownName)).toBe(true);
		expect(csv.csv.includes("in_use")).toBe(true);
		expect(csv.csv.includes(quietName)).toBe(false);
		expect(csv.csv.includes(phone)).toBe(false);
		expect(csv.csv.includes(village)).toBe(false);
		expect(csv.csv.includes(reason)).toBe(false);
		expect(csv.csv.includes(purpose)).toBe(false);
		expect(csv.csv.includes(statement)).toBe(false);
		expect(csv.csv.includes("424242")).toBe(false);
		expect(csv.csv.includes("424343")).toBe(false);
		expect(csv.csv.includes("@demo.ikiraro.test")).toBe(false);

		try {
			await readDonorReport(database, [
				{ role: "trainer", scopeType: "center", scopeId: center.id },
			]);
			throw new Error("a trainer read the report");
		} catch (error) {
			expect(reasonOf(error)).toBe("scope");
		}
	}, 120_000);
});
