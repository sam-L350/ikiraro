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
	deviceBookings,
	devices,
	districts,
	dormancyAlerts,
	followUps,
	hardwareGrants,
	hardwareInventory,
	learningCenters,
	provinces,
	rankingSnapshots,
	roles,
	roundApplications,
	sectors,
	userRoles,
	users,
} from "../../db/schema";
import { createUserWithPassport } from "../identity/create-user";
import { dormantEventCount, listDormancy } from "./dormancy";
import { askDueFollowUps } from "./follow-ups";

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

function errorText(error: unknown): string {
	if (error instanceof Error && error.cause) return errorText(error.cause);
	return String(error);
}

function daysAgo(days: number): string {
	const utc = new Date();
	utc.setUTCDate(utc.getUTCDate() - days);
	return utc.toISOString().slice(0, 10);
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe.serial("dormancy", () => {
	test("a quiet recipient alerts that district's coordinator, and practice keeps the alert off", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const [role] = await db
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.code, "district_coordinator"))
			.limit(1);
		if (!role) throw new Error("the coordinator role is missing");
		const officer = await createUserWithPassport(db, {
			email: `dormant-officer-${stamp}@demo.ikiraro.test`,
			name: "Dormant officer",
		});
		const recipient = await createUserWithPassport(db, {
			email: `dormant-learner-${stamp}@demo.ikiraro.test`,
			name: "Dormant learner",
		});
		const practicing = await createUserWithPassport(db, {
			email: `dormant-practicing-${stamp}@demo.ikiraro.test`,
			name: "Practicing learner",
		});
		const coordinator = await createUserWithPassport(db, {
			email: `dormant-coordinator-${stamp}@demo.ikiraro.test`,
			name: "Dormant coordinator",
		});
		const other = await createUserWithPassport(db, {
			email: `dormant-other-${stamp}@demo.ikiraro.test`,
			name: "Other coordinator",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `dp-${stamp}`, name: `Dormant province ${stamp}` })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `dd-${stamp}`,
				name: `Dormant district ${stamp}`,
			})
			.returning({ id: districts.id });
		const [elsewhere] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `de-${stamp}`,
				name: `Other district ${stamp}`,
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `ds-${stamp}`,
				name: `Dormant sector ${stamp}`,
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Dormant center ${stamp}` })
			.returning({ id: learningCenters.id });
		if (!district || !elsewhere || !center)
			throw new Error("the district was not stored");
		const districtId = district.id;
		const centerId = center.id;
		await db
			.update(users)
			.set({ centerId })
			.where(eq(users.id, recipient.userId));
		await db
			.update(users)
			.set({ centerId })
			.where(eq(users.id, practicing.userId));
		await db.insert(userRoles).values([
			{
				userId: coordinator.userId,
				roleId: role.id,
				scopeType: "district",
				scopeId: districtId,
			},
			{
				userId: other.userId,
				roleId: role.id,
				scopeType: "district",
				scopeId: elsewhere.id,
			},
		]);
		async function grant(awarded: string, userId: number) {
			const [round] = await db
				.insert(allocationRounds)
				.values({
					districtId,
					title: `Dormant round ${crypto.randomUUID().slice(0, 8)}`,
					quantity: 1,
					opensAt: new Date(Date.now() - 60_000),
					closesAt: new Date(Date.now() + 86_400_000),
					criteria: [],
					openedByUserId: officer.userId,
				})
				.returning({ id: allocationRounds.id });
			const [item] = await db
				.insert(hardwareInventory)
				.values({
					name: "Dormant laptop",
					category: "laptop",
					serial: `DORMANT-${crypto.randomUUID()}`,
					condition: "good",
					status: "awarded",
					centerId,
					acquiredOn: "2026-01-02",
					createdByUserId: officer.userId,
				})
				.returning({ id: hardwareInventory.id });
			if (!round || !item) throw new Error("the round was not stored");
			const [application] = await db
				.insert(roundApplications)
				.values({
					roundId: round.id,
					userId,
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
			const [created] = await db
				.insert(hardwareGrants)
				.values({
					decisionId: decision.id,
					roundId: round.id,
					applicationId: application.id,
					inventoryId: item.id,
					recipientUserId: userId,
					approvedByUserId: officer.userId,
					status: "active",
					awardedOn: awarded,
				})
				.returning({ id: hardwareGrants.id });
			if (!created) throw new Error("the grant was not stored");
			return created.id;
		}
		const quiet = await grant(daysAgo(100), recipient.userId);
		const active = await grant(daysAgo(40), practicing.userId);
		await db.insert(followUps).values([
			{
				grantId: quiet,
				day: 30,
				dueOn: daysAgo(70),
				askedAt: new Date(Date.now() - 86_400_000),
			},
			{ grantId: quiet, day: 90, dueOn: daysAgo(1) },
			{ grantId: quiet, day: 180, dueOn: "2027-06-01" },
			{ grantId: active, day: 30, dueOn: daysAgo(1) },
			{ grantId: active, day: 90, dueOn: "2027-03-01" },
			{ grantId: active, day: 180, dueOn: "2027-06-01" },
		]);
		const [machine] = await db
			.insert(devices)
			.values({
				centerId,
				kind: "computer",
				label: "Practice computer",
				condition: "good",
				availability: "available",
				createdByUserId: officer.userId,
			})
			.returning({ id: devices.id });
		if (!machine) throw new Error("the machine was not stored");
		await db.insert(deviceBookings).values({
			id: crypto.randomUUID(),
			deviceId: machine.id,
			learnerUserId: practicing.userId,
			startsAt: new Date(Date.now() - 3_600_000),
			minutes: 30,
		});
		await askDueFollowUps(db);
		const alerts = await listDormancy(db, [districtId]);
		const quietAlerts = alerts.filter(
			(row) => row.recipientName === "Dormant learner",
		);
		expect(quietAlerts.map((row) => row.reason).sort()).toEqual([
			"not_practicing",
			"not_practicing",
			"unanswered",
		]);
		expect(
			quietAlerts.some((row) => row.day === 30 && row.reason === "unanswered"),
		).toBe(true);
		const elsewhereAlerts = await listDormancy(db, [elsewhere.id]);
		expect(
			elsewhereAlerts.some((row) => row.recipientName === "Dormant learner"),
		).toBe(false);
		const notices = await dormantEventCount(db, coordinator.userId);
		expect(notices).toBe(3);
		expect(await dormantEventCount(db, other.userId)).toBe(0);
		await askDueFollowUps(db);
		expect(await dormantEventCount(db, coordinator.userId)).toBe(notices);
		const [stored] = await db
			.select({ id: dormancyAlerts.id })
			.from(dormancyAlerts)
			.where(eq(dormancyAlerts.grantId, quiet))
			.limit(1);
		if (!stored) throw new Error("the alert was not stored");
		try {
			await db
				.update(dormancyAlerts)
				.set({ reason: "not_practicing" })
				.where(eq(dormancyAlerts.id, stored.id));
			throw new Error("the alert was edited");
		} catch (error) {
			expect(errorText(error).includes("append-only")).toBe(true);
		}
		expect(
			alerts.some((row) => row.recipientName === "Practicing learner"),
		).toBe(false);
	}, 120_000);
});
