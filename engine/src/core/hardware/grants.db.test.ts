import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	committeeDecisions,
	declaredRelationships,
	districts,
	hardwareGrants,
	hardwareStatusHistory,
	learningCenters,
	pointTransactions,
	provinces,
	sectors,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import type { GrantFormula } from "./formula";
import { decideGrant, rankRound, readDecisionRound } from "./grants";
import { createInventoryItem } from "./inventory";
import { applyToRound, openRound } from "./rounds";

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
	if (error instanceof Error) {
		const cause = "cause" in error ? errorText(error.cause) : "";
		return `${error.message} ${cause}`;
	}
	return "";
}

function reasonOf(error: unknown): string | null {
	if (
		!isApiError(error) ||
		typeof error.details !== "object" ||
		!error.details
	) {
		return null;
	}
	if (
		!("reason" in error.details) ||
		typeof error.details.reason !== "string"
	) {
		return null;
	}
	return error.details.reason;
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

function formula(patch: Partial<GrantFormula> = {}): GrantFormula {
	return {
		weights: { points: 1, badges: 0, hours: 0, attendance: 0, months: 0 },
		tieBreak: "earlier_application",
		onePerHousehold: false,
		blockActiveGrant: false,
		...patch,
	};
}

describe.serial("committee grants", () => {
	test("a grant keeps the written formula, the reason, and refuses a conflict or a second item past the policy", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const home = `house-${stamp}`;
		const memberA = await createUserWithPassport(db, {
			email: `grant-a-${stamp}@demo.ikiraro.test`,
			name: "Member A",
		});
		const memberB = await createUserWithPassport(db, {
			email: `grant-b-${stamp}@demo.ikiraro.test`,
			name: "Member B",
		});
		const high = await createUserWithPassport(db, {
			email: `grant-high-${stamp}@demo.ikiraro.test`,
			name: "Higher score",
		});
		const low = await createUserWithPassport(db, {
			email: `grant-low-${stamp}@demo.ikiraro.test`,
			name: "Lower score",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `gp-${stamp}`, name: `Grant province ${stamp}` })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `gd-${stamp}`,
				name: `Grant district ${stamp}`,
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `gs-${stamp}`,
				name: `Grant sector ${stamp}`,
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Grant center ${stamp}` })
			.returning({ id: learningCenters.id });
		if (!district || !center) throw new Error("the district was not stored");
		const districtId = district.id;
		const centerId = center.id;
		await db
			.update(users)
			.set({ centerId, guardianContact: home })
			.where(eq(users.id, high.userId));
		await db
			.update(users)
			.set({ centerId, guardianContact: home })
			.where(eq(users.id, low.userId));
		await db
			.update(users)
			.set({ centerId })
			.where(eq(users.id, memberA.userId));
		await db.insert(declaredRelationships).values({
			userId: memberB.userId,
			relatedUserId: low.userId,
			kind: "household",
		});
		await db.insert(pointTransactions).values([
			{
				userId: high.userId,
				amount: 10,
				kind: "task_approved",
				referenceType: "submission",
				referenceId: crypto.randomUUID(),
			},
			{
				userId: low.userId,
				amount: 1,
				kind: "task_approved",
				referenceType: "submission",
				referenceId: crypto.randomUUID(),
			},
		]);
		const items = [];
		for (let index = 0; index < 5; index += 1) {
			const item = await createInventoryItem(db, {
				actorId: memberA.userId,
				name: `Laptop ${index} ${stamp}`,
				category: "laptop",
				serial: `GR-${stamp}-${index}`,
				condition: "good",
				centerId,
				acquiredOn: "2026-05-01",
				criteria: [],
				ip: "127.0.0.1",
			});
			items.push(item.id);
		}
		const opensAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		const closesAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
		async function opened(title: string, quantity: number) {
			return openRound(db, {
				actorId: memberA.userId,
				districtId,
				title: `${title} ${stamp}`,
				quantity,
				opensAt,
				closesAt,
				criteria: [],
				ip: "127.0.0.1",
			});
		}
		async function applied(userId: number, roundId: string, statement: string) {
			return applyToRound(db, {
				actorId: userId,
				roundId,
				statement,
				ip: "127.0.0.1",
			});
		}

		const first = await opened("Rank", 2);
		const highAsk = await applied(
			high.userId,
			first.id,
			"I will practice daily.",
		);
		const lowAsk = await applied(
			low.userId,
			first.id,
			"I will share the laptop.",
		);
		await rankRound(db, {
			actorId: memberA.userId,
			roundId: first.id,
			formula: formula(),
			ip: "127.0.0.1",
		});
		const ranked = await readDecisionRound(db, first.id);
		const highRank = ranked.applicants.find(
			(row) => row.applicationId === highAsk.id,
		);
		const lowRank = ranked.applicants.find(
			(row) => row.applicationId === lowAsk.id,
		);
		expect(highRank?.rank).toBe(1);
		expect(highRank?.score).toBe(10);
		expect(lowRank?.rank).toBe(2);
		expect(ranked.formula?.onePerHousehold).toBe(false);
		const key = `grant-${stamp}`;
		const awarded = await decideGrant(db, {
			actorId: memberA.userId,
			roundId: first.id,
			applicationId: highAsk.id,
			inventoryId: items[0] ?? "",
			reason: "The higher score, and the statement names daily practice.",
			idempotencyKey: key,
			ip: "127.0.0.1",
		});
		const again = await decideGrant(db, {
			actorId: memberA.userId,
			roundId: first.id,
			applicationId: highAsk.id,
			inventoryId: items[0] ?? "",
			reason: "The higher score, and the statement names daily practice.",
			idempotencyKey: key,
			ip: "127.0.0.1",
		});
		expect(again.id).toBe(awarded.id);
		await decideGrant(db, {
			actorId: memberA.userId,
			roundId: first.id,
			applicationId: lowAsk.id,
			inventoryId: items[1] ?? "",
			reason: "The household rule on this round is off.",
			idempotencyKey: `grant-low-${stamp}`,
			ip: "127.0.0.1",
		});
		const firstGrants = await db
			.select({ id: hardwareGrants.id })
			.from(hardwareGrants)
			.where(eq(hardwareGrants.roundId, first.id));
		expect(firstGrants).toHaveLength(2);
		const history = await db
			.select({ status: hardwareStatusHistory.status })
			.from(hardwareStatusHistory)
			.where(eq(hardwareStatusHistory.inventoryId, items[0] ?? ""))
			.orderBy(asc(hardwareStatusHistory.recordedAt));
		expect(history.map((row) => row.status)).toEqual(["in_stock", "awarded"]);
		let locked = false;
		try {
			await db
				.update(committeeDecisions)
				.set({ reason: "changed" })
				.where(eq(committeeDecisions.id, awarded.decisionId));
		} catch (error) {
			locked = errorText(error).includes("append-only");
			if (!locked) throw error;
		}
		expect(locked).toBe(true);

		const household = await opened("Household", 2);
		const householdHigh = await applied(
			high.userId,
			household.id,
			"Same house, first.",
		);
		const householdLow = await applied(
			low.userId,
			household.id,
			"Same house, second.",
		);
		await rankRound(db, {
			actorId: memberA.userId,
			roundId: household.id,
			formula: formula({ onePerHousehold: true }),
			ip: "127.0.0.1",
		});
		await decideGrant(db, {
			actorId: memberA.userId,
			roundId: household.id,
			applicationId: householdHigh.id,
			inventoryId: items[2] ?? "",
			reason: "First person in this household.",
			idempotencyKey: `house-${stamp}`,
			ip: "127.0.0.1",
		});
		let blockedHouse = false;
		try {
			await decideGrant(db, {
				actorId: memberA.userId,
				roundId: household.id,
				applicationId: householdLow.id,
				inventoryId: items[3] ?? "",
				reason: "Second person in this household.",
				idempotencyKey: `house-2-${stamp}`,
				ip: "127.0.0.1",
			});
		} catch (error) {
			blockedHouse = reasonOf(error) === "one-household";
			if (!blockedHouse) throw error;
		}
		expect(blockedHouse).toBe(true);

		const own = await opened("Self", 1);
		const ownAsk = await applied(
			memberA.userId,
			own.id,
			"I am on the committee.",
		);
		await rankRound(db, {
			actorId: memberB.userId,
			roundId: own.id,
			formula: formula(),
			ip: "127.0.0.1",
		});
		let blockedSelf = false;
		try {
			await decideGrant(db, {
				actorId: memberA.userId,
				roundId: own.id,
				applicationId: ownAsk.id,
				inventoryId: items[3] ?? "",
				reason: "This is my own application.",
				idempotencyKey: `self-${stamp}`,
				ip: "127.0.0.1",
			});
		} catch (error) {
			blockedSelf = reasonOf(error) === "self";
			if (!blockedSelf) throw error;
		}
		expect(blockedSelf).toBe(true);

		const relative = await opened("Relative", 1);
		const relativeAsk = await applied(
			low.userId,
			relative.id,
			"A relative sits on the committee.",
		);
		await rankRound(db, {
			actorId: memberA.userId,
			roundId: relative.id,
			formula: formula(),
			ip: "127.0.0.1",
		});
		let blockedRelative = false;
		try {
			await decideGrant(db, {
				actorId: memberB.userId,
				roundId: relative.id,
				applicationId: relativeAsk.id,
				inventoryId: items[3] ?? "",
				reason: "I know this learner.",
				idempotencyKey: `relative-${stamp}`,
				ip: "127.0.0.1",
			});
		} catch (error) {
			blockedRelative = reasonOf(error) === "relative";
			if (!blockedRelative) throw error;
		}
		expect(blockedRelative).toBe(true);

		const capped = await opened("Quota", 5);
		const quotaHigh = await applied(high.userId, capped.id, "Quota first.");
		const quotaLow = await applied(low.userId, capped.id, "Quota second.");
		await rankRound(db, {
			actorId: memberA.userId,
			roundId: capped.id,
			formula: formula({ quota: 1 }),
			ip: "127.0.0.1",
		});
		await decideGrant(db, {
			actorId: memberA.userId,
			roundId: capped.id,
			applicationId: quotaHigh.id,
			inventoryId: items[3] ?? "",
			reason: "Inside the quota written on the round.",
			idempotencyKey: `quota-${stamp}`,
			ip: "127.0.0.1",
		});
		let blockedQuota = false;
		try {
			await decideGrant(db, {
				actorId: memberA.userId,
				roundId: capped.id,
				applicationId: quotaLow.id,
				inventoryId: items[4] ?? "",
				reason: "Past the quota written on the round.",
				idempotencyKey: `quota-2-${stamp}`,
				ip: "127.0.0.1",
			});
		} catch (error) {
			blockedQuota = reasonOf(error) === "quota";
			if (!blockedQuota) throw error;
		}
		expect(blockedQuota).toBe(true);

		const active = await opened("Active", 1);
		const activeAsk = await applied(
			high.userId,
			active.id,
			"I already have one.",
		);
		await rankRound(db, {
			actorId: memberA.userId,
			roundId: active.id,
			formula: formula({ blockActiveGrant: true }),
			ip: "127.0.0.1",
		});
		let blockedActive = false;
		try {
			await decideGrant(db, {
				actorId: memberA.userId,
				roundId: active.id,
				applicationId: activeAsk.id,
				inventoryId: items[4] ?? "",
				reason: "The round says an active award blocks another.",
				idempotencyKey: `active-${stamp}`,
				ip: "127.0.0.1",
			});
		} catch (error) {
			blockedActive = reasonOf(error) === "active";
			if (!blockedActive) throw error;
		}
		expect(blockedActive).toBe(true);
	}, 120_000);
});
