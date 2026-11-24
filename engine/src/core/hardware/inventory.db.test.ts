import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	districts,
	hardwareStatusHistory,
	learningCenters,
	provinces,
	sectors,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import {
	createInventoryItem,
	evaluateItem,
	updateInventoryItem,
} from "./inventory";

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

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe.serial("hardware inventory", () => {
	test("a status change is added, and the item keeps the rules it was given", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const officer = await createUserWithPassport(db, {
			email: `inventory-${stamp}@demo.ikiraro.test`,
			name: "Inventory officer",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `ip-${stamp}`, name: `Inventory province ${stamp}` })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `id-${stamp}`,
				name: `Inventory district ${stamp}`,
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `is-${stamp}`,
				name: `Inventory sector ${stamp}`,
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({
				sectorId: sector?.id ?? "",
				name: `Inventory center ${stamp}`,
			})
			.returning({ id: learningCenters.id });
		if (!center) throw new Error("the center was not stored");
		const criteria = [{ kind: "points" as const, minimum: 4 }];
		const created = await createInventoryItem(db, {
			actorId: officer.userId,
			name: "Practice laptop",
			category: "laptop",
			serial: `SN-${stamp}`,
			condition: "good",
			centerId: center.id,
			donor: "A neighbor",
			acquiredOn: "2026-03-01",
			criteria,
			ip: "127.0.0.1",
		});
		const first = await updateInventoryItem(db, {
			actorId: officer.userId,
			itemId: created.id,
			condition: "worn",
			status: "in_repair",
			centerId: center.id,
			donor: "A neighbor",
			note: "Screen hinge",
			criteria,
			ip: "127.0.0.1",
		});
		expect(first.status).toBe("in_repair");
		expect(first.condition).toBe("worn");
		expect(first.criteria).toEqual(criteria);
		expect(first.history.map((entry) => entry.status)).toEqual([
			"in_repair",
			"in_stock",
		]);
		const decision = evaluateItem(
			{
				points: 4,
				badgeIds: [],
				verifiedMinutes: 0,
				districtId: null,
				registeredAt: new Date("2026-01-01T00:00:00.000Z"),
				asOf: new Date("2026-06-01T00:00:00.000Z"),
			},
			first.criteria,
		);
		expect(decision[0]?.status).toBe("pass");
		const plain = await createInventoryItem(db, {
			actorId: officer.userId,
			name: "Plain phone",
			category: "phone",
			serial: `SN-plain-${stamp}`,
			condition: "good",
			centerId: center.id,
			acquiredOn: "2026-04-02",
			criteria: [],
			ip: "127.0.0.1",
		});
		const open = await updateInventoryItem(db, {
			actorId: officer.userId,
			itemId: plain.id,
			condition: "good",
			status: "in_stock",
			centerId: center.id,
			criteria: [],
			ip: "127.0.0.1",
		});
		expect(open.criteria).toEqual([]);
		expect(
			evaluateItem(
				{
					points: 0,
					badgeIds: [],
					verifiedMinutes: 0,
					districtId: null,
					registeredAt: new Date(),
					asOf: new Date(),
				},
				open.criteria,
			),
		).toEqual([]);
		let duplicate = false;
		try {
			await createInventoryItem(db, {
				actorId: officer.userId,
				name: "Copy",
				category: "laptop",
				serial: `SN-${stamp}`,
				condition: "good",
				centerId: center.id,
				acquiredOn: "2026-03-01",
				criteria: [],
				ip: "127.0.0.1",
			});
		} catch (error) {
			duplicate = isApiError(error) && error.status === 409;
			if (!duplicate) throw error;
		}
		expect(duplicate).toBe(true);
		const rows = await db
			.select({ id: hardwareStatusHistory.id })
			.from(hardwareStatusHistory)
			.where(eq(hardwareStatusHistory.inventoryId, created.id))
			.orderBy(asc(hardwareStatusHistory.recordedAt));
		const historyId = rows[0]?.id;
		if (!historyId) throw new Error("history was not stored");
		let locked = false;
		try {
			await db
				.update(hardwareStatusHistory)
				.set({ note: "changed" })
				.where(eq(hardwareStatusHistory.id, historyId));
		} catch (error) {
			locked = errorText(error).includes("append-only");
			if (!locked) throw error;
		}
		expect(locked).toBe(true);
	}, 90_000);
});
