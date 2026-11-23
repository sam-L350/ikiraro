import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import { users } from "../../db/schema";
import { isApiError } from "../api/error";
import { listSettings } from "./config";
import { loadOperations } from "./snapshot";

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

async function userId(
	database: NonNullable<typeof suite>["db"],
	email: string,
): Promise<number> {
	const [row] = await database
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	if (!row) throw new Error(`Missing demo account ${email}`);
	return row.id;
}

describe("operations snapshot", () => {
	test("a trainer sees queue depth and a manager sees center health", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const trainerId = await userId(db, "trainer@demo.ikiraro.test");
		const managerId = await userId(db, "manager@demo.ikiraro.test");
		const adminId = await userId(db, "admin@demo.ikiraro.test");
		const learnerId = await userId(db, "learner@demo.ikiraro.test");
		const auditorId = await userId(db, "auditor@demo.ikiraro.test");

		const trainer = await loadOperations(db, trainerId);
		expect(trainer.queueDepth).not.toBeNull();
		expect(trainer.centers).toBeNull();
		expect(trainer.system).toBeNull();
		expect(trainer.includesNext).toBe(true);

		const manager = await loadOperations(db, managerId);
		const gitega = manager.centers?.find(
			(center) => center.name === "Gitega Learning Center",
		);
		expect(gitega).toBeDefined();
		expect(
			manager.centers?.some((center) => center.name === "Huye Learning Center"),
		).toBe(false);
		expect(manager.system).toBeNull();
		expect(trainer.queueDepth).toBeGreaterThanOrEqual(
			gitega?.waitingSubmissions ?? 0,
		);

		const admin = await loadOperations(db, adminId);
		expect(admin.system).not.toBeNull();
		expect(admin.queueDepth).toBeNull();
		expect(admin.centers).toBeNull();
		const settings = await listSettings(db);
		expect(settings.some((row) => row.key === "session.shared_idle_ms")).toBe(
			true,
		);

		const learner = await loadOperations(db, learnerId);
		expect(learner.includesNext).toBe(true);
		expect(learner.queueDepth).toBeNull();
		expect(learner.centers).toBeNull();
		expect(learner.system).toBeNull();

		let auditorStatus = 0;
		try {
			await loadOperations(db, auditorId);
		} catch (error) {
			if (!isApiError(error)) throw error;
			auditorStatus = error.status;
		}
		expect(auditorStatus).toBe(403);
	}, 60_000);
});
