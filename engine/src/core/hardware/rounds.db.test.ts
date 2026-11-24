import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	districts,
	learningCenters,
	provinces,
	sectors,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import {
	applyToRound,
	countApplications,
	openRound,
	readRound,
} from "./rounds";

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

describe.serial("allocation rounds", () => {
	test("a passing application keeps each criterion result, and a miss writes nothing", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const coordinator = await createUserWithPassport(db, {
			email: `rounds-${stamp}@demo.ikiraro.test`,
			name: "Round coordinator",
		});
		const learner = await createUserWithPassport(db, {
			email: `rounds-learner-${stamp}@demo.ikiraro.test`,
			name: "Round learner",
		});
		const visitor = await createUserWithPassport(db, {
			email: `rounds-visitor-${stamp}@demo.ikiraro.test`,
			name: "Round visitor",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `rp-${stamp}`, name: `Round province ${stamp}` })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `rd-${stamp}`,
				name: `Round district ${stamp}`,
			})
			.returning({ id: districts.id });
		const [otherDistrict] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `ro-${stamp}`,
				name: `Other district ${stamp}`,
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `rs-${stamp}`,
				name: `Round sector ${stamp}`,
			})
			.returning({ id: sectors.id });
		const [otherSector] = await db
			.insert(sectors)
			.values({
				districtId: otherDistrict?.id ?? "",
				code: `rx-${stamp}`,
				name: `Other sector ${stamp}`,
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Round center ${stamp}` })
			.returning({ id: learningCenters.id });
		const [otherCenter] = await db
			.insert(learningCenters)
			.values({
				sectorId: otherSector?.id ?? "",
				name: `Other center ${stamp}`,
			})
			.returning({ id: learningCenters.id });
		if (!district || !center || !otherCenter) {
			throw new Error("the district was not stored");
		}
		await db
			.update(users)
			.set({ centerId: center.id })
			.where(eq(users.id, learner.userId));
		await db
			.update(users)
			.set({ centerId: otherCenter.id })
			.where(eq(users.id, visitor.userId));
		const opensAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		const closesAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
		const opened = await openRound(db, {
			actorId: coordinator.userId,
			districtId: district.id,
			title: `Laptops ${stamp}`,
			quantity: 3,
			opensAt,
			closesAt,
			criteria: [{ kind: "points", minimum: 0 }],
			ip: "127.0.0.1",
		});
		const applied = await applyToRound(db, {
			actorId: learner.userId,
			roundId: opened.id,
			statement: "I will keep practicing at the center.",
			ip: "127.0.0.1",
		});
		expect(applied.results[0]?.status).toBe("pass");
		const detail = await readRound(db, opened.id);
		expect(detail.quantity).toBe(3);
		expect(detail.applications).toHaveLength(1);
		expect(detail.applications[0]?.results).toEqual(applied.results);
		expect(detail.applications[0]?.statement).toBe(
			"I will keep practicing at the center.",
		);
		let duplicate = false;
		try {
			await applyToRound(db, {
				actorId: learner.userId,
				roundId: opened.id,
				statement: "I will keep practicing at the center.",
				ip: "127.0.0.1",
			});
		} catch (error) {
			duplicate = isApiError(error) && error.status === 409;
			if (!duplicate) throw error;
		}
		expect(duplicate).toBe(true);
		const strict = await openRound(db, {
			actorId: coordinator.userId,
			districtId: district.id,
			title: `Phones ${stamp}`,
			quantity: 1,
			opensAt,
			closesAt,
			criteria: [{ kind: "points", minimum: 5 }],
			ip: "127.0.0.1",
		});
		let blocked = false;
		try {
			await applyToRound(db, {
				actorId: learner.userId,
				roundId: strict.id,
				statement: "I need a phone for practice.",
				ip: "127.0.0.1",
			});
		} catch (error) {
			blocked = isApiError(error) && error.status === 409;
			if (!blocked) throw error;
		}
		expect(blocked).toBe(true);
		expect(await countApplications(db, strict.id)).toBe(0);
		const plain = await openRound(db, {
			actorId: coordinator.userId,
			districtId: district.id,
			title: `Open ${stamp}`,
			quantity: 2,
			opensAt,
			closesAt,
			criteria: [],
			ip: "127.0.0.1",
		});
		const free = await applyToRound(db, {
			actorId: learner.userId,
			roundId: plain.id,
			statement: "No extra rule on this round.",
			ip: "127.0.0.1",
		});
		expect(free.results).toEqual([]);
		let outsider = false;
		try {
			await applyToRound(db, {
				actorId: visitor.userId,
				roundId: opened.id,
				statement: "I train in another district.",
				ip: "127.0.0.1",
			});
		} catch (error) {
			outsider = isApiError(error) && error.status === 403;
			if (!outsider) throw error;
		}
		expect(outsider).toBe(true);
		const later = await openRound(db, {
			actorId: coordinator.userId,
			districtId: district.id,
			title: `Later ${stamp}`,
			quantity: 4,
			opensAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
			closesAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
			criteria: [],
			ip: "127.0.0.1",
		});
		let closed = false;
		try {
			await applyToRound(db, {
				actorId: learner.userId,
				roundId: later.id,
				statement: "This window has not opened.",
				ip: "127.0.0.1",
			});
		} catch (error) {
			closed = isApiError(error) && error.status === 409;
			if (!closed) throw error;
		}
		expect(closed).toBe(true);
		expect(await countApplications(db, later.id)).toBe(0);
	}, 90_000);
});
