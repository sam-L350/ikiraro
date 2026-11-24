import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	centerStaff,
	deviceBookings,
	districts,
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
	bookPracticeSlot,
	createCenterDevice,
	updateCenterDevice,
} from "./devices";
import { searchDirectory } from "./directory";

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

describe.serial("center devices", () => {
	test("a practice slot is stored once and a search finds the nearer center", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const trainer = await createUserWithPassport(db, {
			email: `device-${stamp}-trainer@demo.ikiraro.test`,
			name: "Device trainer",
		});
		const learner = await createUserWithPassport(db, {
			email: `device-${stamp}-learner@demo.ikiraro.test`,
			name: "Device learner",
		});
		const outsider = await createUserWithPassport(db, {
			email: `device-${stamp}-out@demo.ikiraro.test`,
			name: "Device outsider",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `dp-${stamp}`, name: `Device province ${stamp}` })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `dd-${stamp}`,
				name: `Device district ${stamp}`,
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `ds-${stamp}`,
				name: `Device sector ${stamp}`,
			})
			.returning({ id: sectors.id });
		const [near] = await db
			.insert(learningCenters)
			.values({
				sectorId: sector?.id ?? "",
				name: `Device near ${stamp}`,
				latitude: -1.95,
				longitude: 30.06,
			})
			.returning({ id: learningCenters.id });
		const [far] = await db
			.insert(learningCenters)
			.values({
				sectorId: sector?.id ?? "",
				name: `Device far ${stamp}`,
				latitude: -2.6,
				longitude: 29.7,
			})
			.returning({ id: learningCenters.id });
		const [closed] = await db
			.insert(learningCenters)
			.values({
				sectorId: sector?.id ?? "",
				name: `Device closed ${stamp}`,
				latitude: -1.94,
				longitude: 30.05,
				active: false,
			})
			.returning({ id: learningCenters.id });
		if (!near || !far || !closed) throw new Error("the center was not stored");
		const [role] = await db
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.code, "trainer"))
			.limit(1);
		if (!role) throw new Error("trainer role was not found");
		await db.insert(userRoles).values({
			userId: trainer.userId,
			roleId: role.id,
			scopeType: "center",
			scopeId: near.id,
		});
		await db.insert(centerStaff).values({
			centerId: near.id,
			userId: trainer.userId,
			role: "trainer",
		});
		await db
			.update(users)
			.set({ centerId: near.id })
			.where(eq(users.id, learner.userId));
		const created = await createCenterDevice(db, {
			actorId: trainer.userId,
			centerId: near.id,
			kind: "computer",
			label: "Front desk",
			condition: "good",
			availability: "available",
			ip: "127.0.0.1",
		});
		const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
		const bookingId = crypto.randomUUID();
		const booked = await bookPracticeSlot(db, {
			learnerId: learner.userId,
			deviceId: created.id,
			bookingId,
			startsAt,
			minutes: 60,
			ip: "127.0.0.1",
		});
		expect(booked.minutes).toBe(60);
		const again = await bookPracticeSlot(db, {
			learnerId: learner.userId,
			deviceId: created.id,
			bookingId,
			startsAt,
			minutes: 60,
			ip: "127.0.0.1",
		});
		expect(again.id).toBe(bookingId);
		const [stored] = await db
			.select({ taken: count() })
			.from(deviceBookings)
			.where(eq(deviceBookings.deviceId, created.id));
		expect(Number(stored?.taken ?? 0)).toBe(1);
		await expectStatus(
			() =>
				bookPracticeSlot(db, {
					learnerId: learner.userId,
					deviceId: created.id,
					bookingId: crypto.randomUUID(),
					startsAt: new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString(),
					minutes: 60,
					ip: "127.0.0.1",
				}),
			409,
			"overlap",
		);
		await expectStatus(
			() =>
				bookPracticeSlot(db, {
					learnerId: outsider.userId,
					deviceId: created.id,
					bookingId: crypto.randomUUID(),
					startsAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
					minutes: 30,
					ip: "127.0.0.1",
				}),
			404,
		);
		await updateCenterDevice(db, {
			actorId: trainer.userId,
			deviceId: created.id,
			condition: "broken",
			availability: "available",
			ip: "127.0.0.1",
		});
		await expectStatus(
			() =>
				bookPracticeSlot(db, {
					learnerId: learner.userId,
					deviceId: created.id,
					bookingId: crypto.randomUUID(),
					startsAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
					minutes: 30,
					ip: "127.0.0.1",
				}),
			409,
			"device",
		);
		const found = await searchDirectory(db, { q: `Device near ${stamp}` });
		expect(found.items.map((item) => item.id)).toEqual([near.id]);
		const ordered = await searchDirectory(db, {
			q: stamp,
			latitude: -1.94,
			longitude: 30.06,
		});
		expect(ordered.items[0]?.id).toBe(near.id);
		expect(ordered.items.some((item) => item.id === closed.id)).toBe(false);
		expect(ordered.items[0]?.distanceKm).not.toBeNull();
	}, 90_000);
});
