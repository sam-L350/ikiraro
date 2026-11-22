import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestEnv } from "../../../test/helpers";
import * as schema from "../../db/schema";
import { consents, roles, userRoles, users } from "../../db/schema";
import { isApiError } from "../api/error";
import { login, resetLoginGuards } from "../auth/login";
import { previewAssignment } from "../authz/preview";
import { resetRateLimits } from "../guard/rate-limit";
import type { SmsSender } from "../sms/sender";
import type { ConsentChoice, ConsentPurpose } from "./consent";
import { recordConsent } from "./consent";
import { createUserWithPassport } from "./create-user";
import {
	activateLearner,
	type RegistrationInput,
	registerLearner,
} from "./register";

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
			const body = bodies.at(-1) ?? "";
			const match = /Ikiraro code: (\d{6})/.exec(body);
			if (!match?.[1]) throw new Error("The test SMS did not include a code");
			return match[1];
		},
	};
}

function choices(
	overrides: Partial<Record<ConsentPurpose, boolean>> = {},
): ConsentChoice[] {
	const rows: ConsentChoice[] = [
		{ purpose: "terms", granted: true },
		{ purpose: "data_use", granted: true },
		{
			purpose: "public_passport",
			granted: overrides.public_passport ?? false,
		},
		{ purpose: "leaderboard", granted: overrides.leaderboard ?? false },
		{
			purpose: "mentor_contact",
			granted: overrides.mentor_contact ?? false,
		},
	];
	if (overrides.guardian !== undefined) {
		rows.push({ purpose: "guardian", granted: overrides.guardian });
	}
	return rows;
}

function registration(
	phone: string,
	extra: Partial<RegistrationInput> & { createdByUserId?: number } = {},
): RegistrationInput & { createdByUserId?: number } {
	return {
		name: "Aline Uwase",
		phone,
		dateOfBirth: "1998-04-12",
		district: "Gasabo",
		sector: "Kimironko",
		village: "Kibagabaga",
		economicSector: "tailoring",
		locale: "rw",
		consents: choices(),
		ip: `test-${phone}`,
		...extra,
	};
}

describe.serial("registration", () => {
	test.skipIf(suite === null)(
		"a learner stays inactive until their own code",
		async () => {
			if (!suite) return;
			const sms = captureSms();
			const phone = nextPhone();
			const created = await registerLearner(
				suite.db,
				registration(phone),
				sms.sender,
			);
			expect(created.active).toBe(false);

			const [stored] = await suite.db
				.select({ activatedAt: users.activatedAt })
				.from(users)
				.where(eq(users.id, created.id));
			expect(stored?.activatedAt).toBeNull();

			const code = sms.code();
			const wrong = code === "000000" ? "111111" : "000000";
			await expect(
				activateLearner(suite.db, { phone, code: wrong, ip: "test" }),
			).rejects.toThrow();
			const [still] = await suite.db
				.select({ activatedAt: users.activatedAt })
				.from(users)
				.where(eq(users.id, created.id));
			expect(still?.activatedAt).toBeNull();

			await expect(
				login(suite.db, { method: "otp", phone, code, ip: "test" }),
			).rejects.toThrow();
			const [afterLogin] = await suite.db
				.select({ activatedAt: users.activatedAt })
				.from(users)
				.where(eq(users.id, created.id));
			expect(afterLogin?.activatedAt).toBeNull();

			const activated = await activateLearner(suite.db, {
				phone,
				code,
				ip: "test",
			});
			expect(activated.user.id).toBe(created.id);
			const [done] = await suite.db
				.select({ activatedAt: users.activatedAt })
				.from(users)
				.where(eq(users.id, created.id));
			expect(done?.activatedAt).not.toBeNull();
		},
		30_000,
	);

	test.skipIf(suite === null)(
		"a minor needs a guardian, and public options stay off",
		async () => {
			if (!suite) return;
			const sms = captureSms();
			const phone = nextPhone();
			await expect(
				registerLearner(
					suite.db,
					registration(phone, {
						dateOfBirth: "2015-06-01",
						consents: choices({ guardian: true }),
					}),
					sms.sender,
				),
			).rejects.toThrow();

			const created = await registerLearner(
				suite.db,
				registration(phone, {
					dateOfBirth: "2015-06-01",
					guardianContact: "250788000111",
					consents: choices({
						guardian: true,
						public_passport: true,
						mentor_contact: true,
					}),
				}),
				sms.sender,
			);
			const rows = await suite.db
				.select({ purpose: consents.purpose, granted: consents.granted })
				.from(consents)
				.where(eq(consents.userId, created.id));
			const granted = Object.fromEntries(
				rows.map((row) => [row.purpose, row.granted]),
			);
			expect(granted.public_passport).toBe(false);
			expect(granted.mentor_contact).toBe(false);
			expect(granted.guardian).toBe(true);
		},
		30_000,
	);

	test.skipIf(suite === null)(
		"withdrawing consent writes a new row and leaves the old one",
		async () => {
			if (!suite) return;
			const sms = captureSms();
			const phone = nextPhone();
			const created = await registerLearner(
				suite.db,
				registration(phone, {
					consents: choices({ public_passport: true }),
				}),
				sms.sender,
			);
			const [original] = await suite.db
				.select({ id: consents.id, granted: consents.granted })
				.from(consents)
				.where(
					and(
						eq(consents.userId, created.id),
						eq(consents.purpose, "public_passport"),
					),
				);
			expect(original?.granted).toBe(true);

			await recordConsent(suite.db, {
				userId: created.id,
				purpose: "public_passport",
				granted: false,
			});
			const rows = await suite.db
				.select({ id: consents.id, granted: consents.granted })
				.from(consents)
				.where(
					and(
						eq(consents.userId, created.id),
						eq(consents.purpose, "public_passport"),
					),
				);
			expect(rows).toHaveLength(2);
			expect(rows.find((row) => row.id === original?.id)?.granted).toBe(true);
			expect(rows.some((row) => row.granted === false)).toBe(true);
		},
		30_000,
	);

	test.skipIf(suite === null)(
		"assisted registration stores the trainer and stays inactive",
		async () => {
			if (!suite) return;
			const trainer = await createUserWithPassport(suite.db, {
				email: `trainer-${crypto.randomUUID()}@example.com`,
				name: "Trainer Keza",
			});
			const [role] = await suite.db
				.select({ id: roles.id })
				.from(roles)
				.where(eq(roles.code, "trainer"))
				.limit(1);
			expect(role).toBeDefined();
			if (!role) return;
			const scope = previewAssignment("trainer", trainer.userId);
			await suite.db.insert(userRoles).values({
				userId: trainer.userId,
				roleId: role.id,
				scopeType: scope.scopeType,
				scopeId: scope.scopeId,
			});

			const sms = captureSms();
			const created = await registerLearner(
				suite.db,
				registration(nextPhone(), { createdByUserId: trainer.userId }),
				sms.sender,
			);
			const [stored] = await suite.db
				.select({
					createdByUserId: users.createdByUserId,
					activatedAt: users.activatedAt,
				})
				.from(users)
				.where(eq(users.id, created.id));
			expect(stored?.createdByUserId).toBe(trainer.userId);
			expect(stored?.activatedAt).toBeNull();
		},
		30_000,
	);

	test.skipIf(suite === null)(
		"the same phone cannot register twice",
		async () => {
			if (!suite) return;
			const sms = captureSms();
			const phone = nextPhone();
			await registerLearner(suite.db, registration(phone), sms.sender);
			try {
				await registerLearner(suite.db, registration(phone), sms.sender);
				throw new Error("expected a conflict");
			} catch (error) {
				expect(isApiError(error)).toBe(true);
				if (!isApiError(error)) return;
				expect(error.status).toBe(409);
			}
		},
		30_000,
	);
});
