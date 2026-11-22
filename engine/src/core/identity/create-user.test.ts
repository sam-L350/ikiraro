import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import { digitalPassports, users } from "../../db/schema";
import { createUserWithPassport, insertUserWithPassport } from "./create-user";

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

describe("createUserWithPassport", () => {
	test.skipIf(suite === null)(
		"a new user and passport are stored together",
		async () => {
			if (!suite) return;
			const email = `identity-${crypto.randomUUID()}@example.com`;
			const phone = `2507${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
			const created = await createUserWithPassport(suite.db, { email, phone });
			const [passport] = await suite.db
				.select({ userId: digitalPassports.userId })
				.from(digitalPassports)
				.where(eq(digitalPassports.id, created.passportId));
			expect(passport?.userId).toBe(created.userId);
			await suite.db.delete(users).where(eq(users.id, created.userId));
		},
	);

	test.skipIf(suite === null)(
		"a rolled-back create leaves no user and no passport",
		async () => {
			if (!suite) return;
			const email = `rollback-${crypto.randomUUID()}@example.com`;
			await expect(
				suite.db.transaction(async (tx) => {
					await insertUserWithPassport(tx, { email });
					throw new Error("rollback");
				}),
			).rejects.toThrow("rollback");
			const stored = await suite.db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.email, email));
			expect(stored).toHaveLength(0);
		},
	);

	test.skipIf(suite === null)("phone is unique", async () => {
		if (!suite) return;
		const phone = `2508${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
		const first = await createUserWithPassport(suite.db, {
			email: `phone-a-${crypto.randomUUID()}@example.com`,
			phone,
		});
		await expect(
			createUserWithPassport(suite.db, {
				email: `phone-b-${crypto.randomUUID()}@example.com`,
				phone,
			}),
		).rejects.toThrow();
		const rows = await suite.db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.phone, phone));
		expect(rows).toHaveLength(1);
		await suite.db.delete(users).where(eq(users.id, first.userId));
	});
});
