import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestEnv } from "../../../test/helpers";
import { createUserWithPassport } from "../../core/identity/create-user";
import * as schema from "../../db/schema";
import { otpChallenges, users } from "../../db/schema";
import { resetRateLimits } from "../guard/rate-limit";
import type { SmsSender } from "../sms/sender";
import { createOtp, login, resetLoginGuards } from "./login";
import { hashPassword } from "./password";
import { sessionCookie } from "./sessions";

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
	const client = postgres(url, { max: 4, connect_timeout: 15 });
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

function captureSms(): { sender: SmsSender; bodies: string[] } {
	const bodies: string[] = [];
	return {
		bodies,
		sender: {
			async send(message) {
				bodies.push(message.body);
			},
		},
	};
}

function testPhone(prefix: string): string {
	const bytes = new Uint32Array(1);
	crypto.getRandomValues(bytes);
	const suffix = String((bytes[0] ?? 0) % 10_000_000).padStart(7, "0");
	return `${prefix}${suffix}`;
}

function codeFrom(body: string | undefined): string {
	const code = body?.match(/(\d{6})$/)?.[1];
	if (!code) throw new Error("The dev SMS did not include a code");
	return code;
}

async function cleanup(phone: string) {
	if (!suite || phone.length === 0) return;
	await suite.db.delete(otpChallenges).where(eq(otpChallenges.phone, phone));
}

describe.serial("phone and password login", () => {
	test.skipIf(suite === null)(
		"the one-time code is not in the response",
		async () => {
			if (!suite) return;
			const phone = testPhone("25078");
			await createUserWithPassport(suite.db, {
				email: `otp-${crypto.randomUUID()}@example.com`,
				phone,
			});
			const sms = captureSms();
			try {
				const result = await createOtp(
					suite.db,
					{ phone, ip: "203.0.113.10" },
					sms.sender,
				);
				const code = codeFrom(sms.bodies[0]);
				expect(result).toEqual({ sent: true });
				expect(JSON.stringify(result)).not.toContain(code);
				expect(JSON.stringify(result)).not.toContain("codeHash");
			} finally {
				await cleanup(phone);
			}
		},
		30_000,
	);

	test.skipIf(suite === null)(
		"five wrong codes lock the right code out",
		async () => {
			if (!suite) return;
			const phone = testPhone("25079");
			await createUserWithPassport(suite.db, {
				email: `lock-${crypto.randomUUID()}@example.com`,
				phone,
			});
			const sms = captureSms();
			try {
				await createOtp(suite.db, { phone, ip: "203.0.113.11" }, sms.sender);
				const code = codeFrom(sms.bodies[0]);
				const wrong = code === "000000" ? "111111" : "000000";
				for (let attempt = 0; attempt < 4; attempt += 1) {
					await expect(
						login(suite.db, {
							method: "otp",
							phone,
							code: wrong,
							ip: "203.0.113.11",
						}),
					).rejects.toThrow("That code is not right.");
				}
				await expect(
					login(suite.db, {
						method: "otp",
						phone,
						code: wrong,
						ip: "203.0.113.11",
					}),
				).rejects.toThrow("Too many attempts");
				await expect(
					login(suite.db, {
						method: "otp",
						phone,
						code,
						ip: "203.0.113.11",
					}),
				).rejects.toThrow("Too many attempts");
			} finally {
				await cleanup(phone);
			}
		},
		30_000,
	);

	test.skipIf(suite === null)(
		"a valid code opens a session cookie and cannot be reused",
		async () => {
			if (!suite) return;
			const phone = testPhone("25073");
			const created = await createUserWithPassport(suite.db, {
				email: `session-${crypto.randomUUID()}@example.com`,
				phone,
			});
			const sms = captureSms();
			try {
				await createOtp(suite.db, { phone, ip: "203.0.113.12" }, sms.sender);
				const session = await login(suite.db, {
					method: "otp",
					phone,
					code: codeFrom(sms.bodies[0]),
					ip: "203.0.113.12",
				});
				expect(session.user).toEqual({
					id: created.userId,
					email: expect.any(String),
					name: null,
				});
				expect(session.user).not.toHaveProperty("passwordHash");
				expect(sessionCookie(session.token)).toContain("HttpOnly");
				await expect(
					login(suite.db, {
						method: "otp",
						phone,
						code: codeFrom(sms.bodies[0]),
						ip: "203.0.113.12",
					}),
				).rejects.toThrow("That code is not right.");
			} finally {
				await cleanup(phone);
			}
		},
		30_000,
	);

	test.skipIf(suite === null)(
		"email and password sign in without returning the hash",
		async () => {
			if (!suite) return;
			const email = `staff-${crypto.randomUUID()}@example.com`;
			const password = "correct-horse";
			const created = await createUserWithPassport(suite.db, { email });
			await suite.db
				.update(users)
				.set({ passwordHash: await hashPassword(password) })
				.where(eq(users.id, created.userId));
			try {
				const session = await login(suite.db, {
					method: "password",
					email,
					password,
					ip: "203.0.113.13",
				});
				expect(session.user.id).toBe(created.userId);
				expect(JSON.stringify(session.user)).not.toContain("passwordHash");
				expect(sessionCookie(session.token)).toContain("session=");
			} finally {
				await cleanup("");
			}
		},
		30_000,
	);
});
