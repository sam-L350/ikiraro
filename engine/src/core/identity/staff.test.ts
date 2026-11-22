import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestEnv } from "../../../test/helpers";
import * as schema from "../../db/schema";
import { roles, userRoles, users } from "../../db/schema";
import type { RequestContext } from "../api/context";
import { requestStorage } from "../api/context";
import { isApiError } from "../api/error";
import { allowsPasswordChange, requireAuth } from "../auth/require-auth";
import type { Logger } from "../logger";
import { createUserWithPassport } from "./create-user";
import {
	changeOwnPassword,
	createStaffAccount,
	deactivateStaff,
	decideStaffGrant,
} from "./staff";

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

const manager = [
	{
		role: "center_manager" as const,
		scopeType: "center" as const,
		scopeId: "center-a",
	},
];

test("a center manager cannot assign a global admin role", () => {
	const decision = decideStaffGrant({
		assignments: manager,
		role: "platform_admin",
		scopeType: "global",
		scopeId: "global",
	});
	expect(decision.ok).toBe(false);
});

test("a center manager can assign a trainer in their own center", () => {
	const decision = decideStaffGrant({
		assignments: manager,
		role: "trainer",
		scopeType: "center",
		scopeId: "center-a",
	});
	expect(decision).toEqual({ ok: true, permission: "center.manage" });
});

test("only the password routes stay open before the first change", () => {
	expect(allowsPasswordChange("/api/v1/auth/password")).toBe(true);
	expect(allowsPasswordChange("/api/v1/auth/me")).toBe(true);
	expect(allowsPasswordChange("/api/v1/profile")).toBe(false);
});

describe.serial("staff provisioning", () => {
	test.skipIf(suite === null)(
		"a new staff account is blocked until the temporary password changes",
		async () => {
			if (!suite) return;
			const actor = await createUserWithPassport(suite.db, {
				email: `manager-${crypto.randomUUID()}@example.com`,
				name: "Center Lead",
			});
			const [role] = await suite.db
				.select({ id: roles.id })
				.from(roles)
				.where(eq(roles.code, "center_manager"))
				.limit(1);
			if (!role) throw new Error("center manager role is missing");
			await suite.db.insert(userRoles).values({
				userId: actor.userId,
				roleId: role.id,
				scopeType: "center",
				scopeId: "center-a",
			});

			await expect(
				createStaffAccount(suite.db, {
					actorId: actor.userId,
					name: "Global Admin",
					email: `nope-${crypto.randomUUID()}@example.com`,
					password: "temporary-pass",
					role: "platform_admin",
					scopeType: "global",
					scopeId: "global",
					ip: "test",
				}),
			).rejects.toThrow();

			const created = await createStaffAccount(suite.db, {
				actorId: actor.userId,
				name: "New Trainer",
				email: `trainer-${crypto.randomUUID()}@example.com`,
				password: "temporary-pass",
				role: "trainer",
				scopeType: "center",
				scopeId: "center-a",
				ip: "test",
			});
			expect(created.mustChangePassword).toBe(true);
			const [stored] = await suite.db
				.select()
				.from(users)
				.where(eq(users.id, created.id));
			if (!stored) throw new Error("staff user was not stored");
			expect(stored.mustChangePassword).toBe(true);

			const blocked = await requestStorage.run(
				fakeContext("/api/v1/profile", stored),
				() =>
					requireAuth().then(
						() => "opened",
						(error: unknown) => error,
					),
			);
			expect(isApiError(blocked)).toBe(true);
			if (isApiError(blocked)) {
				expect(blocked.status).toBe(403);
				expect(blocked.details).toEqual({
					reason: "password_change_required",
				});
			}

			const allowed = await requestStorage.run(
				fakeContext("/api/v1/auth/password", stored),
				() => requireAuth(),
			);
			expect(allowed.id).toBe(created.id);

			await changeOwnPassword(suite.db, {
				userId: created.id,
				currentPassword: "temporary-pass",
				nextPassword: "replaced-pass",
				ip: "test",
			});
			const [ready] = await suite.db
				.select({ mustChangePassword: users.mustChangePassword })
				.from(users)
				.where(eq(users.id, created.id));
			expect(ready?.mustChangePassword).toBe(false);

			await deactivateStaff(suite.db, {
				actorId: actor.userId,
				userId: created.id,
				ip: "test",
			});
			const [closed] = await suite.db
				.select({ deactivatedAt: users.deactivatedAt })
				.from(users)
				.where(eq(users.id, created.id));
			expect(closed?.deactivatedAt).not.toBeNull();
		},
		30_000,
	);
});

function fakeContext(pathname: string, user: schema.User): RequestContext {
	const logger = {
		error() {},
		info() {},
		warn() {},
		debug() {},
		child() {
			return logger;
		},
	} as unknown as Logger;
	return {
		request: new Request(`http://local${pathname}`),
		url: new URL(`http://local${pathname}`),
		requestId: "test",
		startedAt: 0,
		logger,
		responseHeaders: new Headers(),
		user: async () => user,
	};
}
