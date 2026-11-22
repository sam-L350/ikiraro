import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestEnv } from "../../../test/helpers";
import * as schema from "../../db/schema";
import {
	consents,
	digitalPassports,
	systemAuditLogs,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { login, resetLoginGuards } from "../auth/login";
import { hashPassword } from "../auth/password";
import { recoverSession, requestRecovery } from "../auth/recovery";
import { resetRateLimits } from "../guard/rate-limit";
import type { SmsSender } from "../sms/sender";
import type { ConsentChoice } from "./consent";
import { createUserWithPassport } from "./create-user";
import { deactivateAccount, requestDeletion, TOMBSTONE_NAME } from "./privacy";
import { registerLearner } from "./register";

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
	resetLoginGuards();
	resetRateLimits();
});

function nextPhone(): string {
	const bytes = new Uint32Array(1);
	crypto.getRandomValues(bytes);
	return `2507${String((bytes[0] ?? 0) % 100_000_000).padStart(8, "0")}`;
}

function captureSms(): { sender: SmsSender; code: () => string } {
	const bodies: string[] = [];
	return {
		sender: {
			async send(message) {
				bodies.push(message.body);
			},
		},
		code() {
			const match = /Ikiraro code: (\d{6})/.exec(bodies.at(-1) ?? "");
			if (!match?.[1]) throw new Error("The test SMS did not include a code");
			return match[1];
		},
	};
}

const adultConsents: ConsentChoice[] = [
	{ purpose: "terms", granted: true },
	{ purpose: "data_use", granted: true },
	{ purpose: "public_passport", granted: false },
	{ purpose: "leaderboard", granted: false },
	{ purpose: "mentor_contact", granted: false },
];

describe.serial("recovery and privacy", () => {
	test.skipIf(suite === null)(
		"a fourth recovery code in the window is refused",
		async () => {
			if (!suite) return;
			const sms = captureSms();
			const phone = nextPhone();
			const ip = `recover-${phone}`;
			await requestRecovery(suite.db, { phone, ip }, sms.sender);
			await requestRecovery(suite.db, { phone, ip }, sms.sender);
			await requestRecovery(suite.db, { phone, ip }, sms.sender);
			try {
				await requestRecovery(suite.db, { phone, ip }, sms.sender);
				throw new Error("expected a rate limit");
			} catch (error) {
				expect(isApiError(error)).toBe(true);
				if (!isApiError(error)) return;
				expect(error.status).toBe(429);
			}
		},
		30_000,
	);

	test.skipIf(suite === null)(
		"five wrong recovery codes lock the right code out",
		async () => {
			if (!suite) return;
			const phone = nextPhone();
			await createUserWithPassport(suite.db, {
				email: `recover-${crypto.randomUUID()}@example.com`,
				phone,
				name: "Recover Me",
			});
			const sms = captureSms();
			await requestRecovery(
				suite.db,
				{ phone, ip: `lock-${phone}` },
				sms.sender,
			);
			const code = sms.code();
			const wrong = code === "000000" ? "111111" : "000000";
			for (let attempt = 0; attempt < 5; attempt += 1) {
				await expect(
					recoverSession(suite.db, { phone, code: wrong, ip: "lock" }),
				).rejects.toThrow();
			}
			await expect(
				recoverSession(suite.db, { phone, code, ip: "lock" }),
			).rejects.toThrow();
		},
		30_000,
	);

	test.skipIf(suite === null)(
		"a recovery code opens a deactivated account",
		async () => {
			if (!suite) return;
			const phone = nextPhone();
			const created = await createUserWithPassport(suite.db, {
				email: `open-${crypto.randomUUID()}@example.com`,
				phone,
				name: "Closed Briefly",
			});
			await suite.db
				.update(users)
				.set({ deactivatedAt: new Date() })
				.where(eq(users.id, created.userId));
			const sms = captureSms();
			await requestRecovery(
				suite.db,
				{ phone, ip: `open-${phone}` },
				sms.sender,
			);
			const session = await recoverSession(suite.db, {
				phone,
				code: sms.code(),
				ip: "open",
			});
			expect(session.token.startsWith("session_")).toBe(true);
			const [stored] = await suite.db
				.select({ deactivatedAt: users.deactivatedAt })
				.from(users)
				.where(eq(users.id, created.userId));
			expect(stored?.deactivatedAt).toBeNull();
		},
		30_000,
	);

	test.skipIf(suite === null)(
		"a deactivated account cannot sign in with a password",
		async () => {
			if (!suite) return;
			const email = `off-${crypto.randomUUID()}@example.com`;
			const created = await createUserWithPassport(suite.db, {
				email,
				name: "Still Named",
			});
			await suite.db
				.update(users)
				.set({ passwordHash: await hashPassword("Ikiraro-demo-1") })
				.where(eq(users.id, created.userId));
			await deactivateAccount(suite.db, { userId: created.userId, ip: "test" });
			await expect(
				login(suite.db, {
					method: "password",
					email,
					password: "Ikiraro-demo-1",
					ip: "test",
				}),
			).rejects.toThrow();
			const [stored] = await suite.db
				.select({ name: users.name, deactivatedAt: users.deactivatedAt })
				.from(users)
				.where(eq(users.id, created.userId));
			expect(stored?.name).toBe("Still Named");
			expect(stored?.deactivatedAt).not.toBeNull();
		},
		30_000,
	);

	test.skipIf(suite === null)(
		"a deletion request keeps the user and writes an audit event",
		async () => {
			if (!suite) return;
			const sms = captureSms();
			const phone = nextPhone();
			const created = await registerLearner(
				suite.db,
				{
					name: "To Remove",
					phone,
					dateOfBirth: "1994-02-02",
					district: "Gasabo",
					sector: "Kimironko",
					village: "Kibagabaga",
					economicSector: "farming",
					locale: "rw",
					consents: adultConsents,
					ip: `delete-${phone}`,
				},
				sms.sender,
			);
			const queued = await requestDeletion(suite.db, {
				userId: created.id,
				ip: "delete",
			});
			expect(queued.status).toBe("queued");

			const [stored] = await suite.db
				.select({
					id: users.id,
					name: users.name,
					phone: users.phone,
					deletedAt: users.deletedAt,
				})
				.from(users)
				.where(eq(users.id, created.id));
			expect(stored?.id).toBe(created.id);
			expect(stored?.name).toBe(TOMBSTONE_NAME);
			expect(stored?.phone).toBeNull();
			expect(stored?.deletedAt).not.toBeNull();

			const [passport] = await suite.db
				.select({ userId: digitalPassports.userId })
				.from(digitalPassports)
				.where(eq(digitalPassports.userId, created.id));
			expect(passport?.userId).toBe(created.id);
			const history = await suite.db
				.select({ id: consents.id })
				.from(consents)
				.where(eq(consents.userId, created.id));
			expect(history.length).toBeGreaterThan(0);

			const audits = await suite.db
				.select({ action: systemAuditLogs.action })
				.from(systemAuditLogs)
				.where(
					and(
						eq(systemAuditLogs.action, "privacy.deletion_requested"),
						eq(systemAuditLogs.targetId, String(created.id)),
					),
				);
			expect(audits).toHaveLength(1);

			await expect(
				requestDeletion(suite.db, { userId: created.id, ip: "delete" }),
			).rejects.toThrow();
		},
		30_000,
	);
});
