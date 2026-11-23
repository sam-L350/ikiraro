import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	consents,
	declaredRelationships,
	digitalPassports,
	pointTransactions,
	privacyRequests,
	users,
} from "../../db/schema";
import { applyLearnerRls } from "../privacy/rls";
import { anonymizeOne } from "./anonymize";
import { createUserWithPassport } from "./create-user";
import { requestDeletion } from "./privacy";

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

describe("anonymizeOne", () => {
	test("a removal keeps the hours and the ledger line, and drops the share link", async () => {
		if (!suite) return;
		const { db } = suite;
		const stamp = crypto.randomUUID();
		const created = await createUserWithPassport(db, {
			email: `privacy-${stamp}@demo.ikiraro.test`,
			name: "Ada",
		});
		await db
			.update(digitalPassports)
			.set({
				verifiedMinutes: 90,
				publicShareToken: `share-${stamp}`,
			})
			.where(eq(digitalPassports.userId, created.userId));
		await db.insert(pointTransactions).values({
			userId: created.userId,
			amount: 12,
			kind: "manual_adjustment",
			referenceType: "adjustment",
			referenceId: stamp,
			uncappedAmount: 12,
		});
		await db.insert(declaredRelationships).values({
			userId: created.userId,
			kind: "guardian",
			contact: "0788000000",
		});
		await db.insert(consents).values({
			userId: created.userId,
			purpose: "terms",
			granted: true,
			version: "1",
		});
		const queued = await requestDeletion(db, {
			userId: created.userId,
			ip: "127.0.0.1",
		});
		await anonymizeOne(db, {
			requestId: queued.id,
			userId: created.userId,
			actorId: created.userId,
			ip: "127.0.0.1",
		});

		const [passport] = await db
			.select({
				minutes: digitalPassports.verifiedMinutes,
				token: digitalPassports.publicShareToken,
			})
			.from(digitalPassports)
			.where(eq(digitalPassports.userId, created.userId));
		const [ledger] = await db
			.select({ amount: pointTransactions.amount })
			.from(pointTransactions)
			.where(eq(pointTransactions.userId, created.userId));
		const [request] = await db
			.select({ status: privacyRequests.status })
			.from(privacyRequests)
			.where(eq(privacyRequests.id, queued.id));
		const [relation] = await db
			.select({ contact: declaredRelationships.contact })
			.from(declaredRelationships)
			.where(eq(declaredRelationships.userId, created.userId));
		const [consent] = await db
			.select({ purpose: consents.purpose })
			.from(consents)
			.where(eq(consents.userId, created.userId));
		const [person] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, created.userId));

		expect(passport?.minutes).toBe(90);
		expect(passport?.token).toBeNull();
		expect(ledger?.amount).toBe(12);
		expect(request?.status).toBe("completed");
		expect(relation?.contact).toBeNull();
		expect(consent?.purpose).toBe("terms");
		expect(person?.id).toBe(created.userId);
	}, 90_000);

	test("a subject policy hides the other person's consent", async () => {
		if (!suite) return;
		const { db } = suite;
		const policies = await db.execute<{ relname: string }>(sql`
				select c.relname as relname
				from pg_policy p
				join pg_class c on c.oid = p.polrelid
				where c.relname in ('consents', 'task_submissions', 'digital_passports')
			`);
		const names = policies.map((row) => row.relname).sort();
		expect(names).toEqual([
			"consents",
			"digital_passports",
			"task_submissions",
		]);

		const [role] = await db.execute<{ bypass: boolean }>(sql`
				select (rolsuper or rolbypassrls) as bypass
				from pg_roles
				where rolname = current_user
			`);
		if (role?.bypass) return;

		const stamp = crypto.randomUUID();
		const first = await createUserWithPassport(db, {
			email: `rls-a-${stamp}@demo.ikiraro.test`,
			name: "A",
		});
		const second = await createUserWithPassport(db, {
			email: `rls-b-${stamp}@demo.ikiraro.test`,
			name: "B",
		});
		await db.insert(consents).values([
			{
				userId: first.userId,
				purpose: "data_use",
				granted: true,
				version: "1",
			},
			{
				userId: second.userId,
				purpose: "data_use",
				granted: true,
				version: "1",
			},
		]);
		const seen = await db.transaction(async (tx) => {
			await applyLearnerRls(tx, { userId: first.userId, scope: "self" });
			return tx
				.select({ userId: consents.userId })
				.from(consents)
				.where(inArray(consents.userId, [first.userId, second.userId]));
		});
		expect(seen.map((row) => row.userId)).toEqual([first.userId]);
	}, 90_000);
});
