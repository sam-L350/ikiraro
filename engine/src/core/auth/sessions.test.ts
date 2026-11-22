import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestEnv } from "../../../test/helpers";
import * as schema from "../../db/schema";
import { sessions } from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import {
	createSession,
	listSessions,
	revokeSession,
	validateSession,
} from "./sessions";
import { pickSharedIdleMs, readSharedIdleMs } from "./shared-idle";

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

beforeEach(() => {
	useTestEnv();
});

test("a missing or tiny idle setting stays at five minutes", () => {
	expect(pickSharedIdleMs([])).toBe(5 * 60 * 1000);
	expect(pickSharedIdleMs([{ version: 1, value: 1000 }])).toBe(5 * 60 * 1000);
	expect(
		pickSharedIdleMs([
			{ version: 1, value: 60_000 },
			{ version: 2, value: 120_000 },
		]),
	).toBe(120_000);
});

describe.serial("shared-device sessions", () => {
	test.skipIf(suite === null)(
		"a shared session expires on the configured idle window",
		async () => {
			if (!suite) return;
			const created = await createUserWithPassport(suite.db, {
				email: `shared-${crypto.randomUUID()}@example.com`,
				name: "Shared Desk",
			});
			const idle = await readSharedIdleMs(suite.db);
			const started = Date.now();
			const token = await createSession(created.userId, suite.db, {
				sharedDevice: true,
			});
			const open = await listSessions(suite.db, {
				userId: created.userId,
				token,
			});
			expect(open).toHaveLength(1);
			expect(open[0]?.current).toBe(true);
			expect(open[0]?.sharedDevice).toBe(true);
			const [stored] = await suite.db
				.select({ expiresAt: sessions.expiresAt })
				.from(sessions)
				.where(eq(sessions.id, open[0]?.id ?? ""));
			const remaining = (stored?.expiresAt.getTime() ?? 0) - started;
			expect(remaining).toBeGreaterThan(idle - 5_000);
			expect(remaining).toBeLessThan(idle + 5_000);

			await suite.db
				.update(sessions)
				.set({ expiresAt: new Date(Date.now() - 1_000) })
				.where(eq(sessions.id, open[0]?.id ?? ""));
			expect(await validateSession(token, suite.db)).toBeNull();
		},
		30_000,
	);

	test.skipIf(suite === null)(
		"revoking one session leaves the other, and another person cannot revoke it",
		async () => {
			if (!suite) return;
			const owner = await createUserWithPassport(suite.db, {
				email: `owner-${crypto.randomUUID()}@example.com`,
				name: "Session Owner",
			});
			const other = await createUserWithPassport(suite.db, {
				email: `other-${crypto.randomUUID()}@example.com`,
				name: "Someone Else",
			});
			const first = await createSession(owner.userId, suite.db);
			const second = await createSession(owner.userId, suite.db);
			const listed = await listSessions(suite.db, {
				userId: owner.userId,
				token: first,
			});
			const otherId = listed.find((row) => !row.current)?.id;
			expect(otherId).toBeTruthy();
			const revoked = await revokeSession(suite.db, {
				userId: owner.userId,
				sessionId: otherId ?? "",
				token: first,
				ip: "test",
			});
			expect(revoked.current).toBe(false);
			const left = await listSessions(suite.db, {
				userId: owner.userId,
				token: first,
			});
			expect(left).toHaveLength(1);
			expect(left[0]?.current).toBe(true);
			try {
				await revokeSession(suite.db, {
					userId: other.userId,
					sessionId: left[0]?.id ?? "",
					token: second,
					ip: "test",
				});
				throw new Error("expected a missing session");
			} catch (error) {
				expect(isApiError(error)).toBe(true);
				if (isApiError(error)) expect(error.status).toBe(404);
			}
		},
		30_000,
	);
});
