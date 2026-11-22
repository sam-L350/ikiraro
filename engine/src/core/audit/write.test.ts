import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import { domainEvents, systemAuditLogs } from "../../db/schema";
import { writeAudit, writeEvent } from "./write";

function isUsable(url: string): boolean {
	try {
		return new URL(url).hostname !== "db";
	} catch {
		return false;
	}
}

/** Other test files replace DATABASE_URL with a fake host. Read the local file then. */
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

function errorText(error: unknown, depth = 0): string {
	if (depth > 6 || typeof error !== "object" || error === null) return "";
	const record = error as { message?: unknown; cause?: unknown };
	const message = typeof record.message === "string" ? record.message : "";
	return `${message}\n${errorText(record.cause, depth + 1)}`;
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe("audit and events", () => {
	test.skipIf(suite === null)(
		"a rolled-back transaction leaves no event or audit row",
		async () => {
			if (!suite) return;
			const { db } = suite;
			const marker = `rollback-${crypto.randomUUID()}`;
			await expect(
				db.transaction(async (tx) => {
					await writeEvent(tx, {
						name: "test.rollback",
						payload: { marker },
					});
					await writeAudit(tx, {
						action: "test.rollback",
						metadata: { marker },
					});
					throw new Error("rollback");
				}),
			).rejects.toThrow("rollback");

			const events = await db
				.select({ id: domainEvents.id })
				.from(domainEvents)
				.where(sql`${domainEvents.payload}->>'marker' = ${marker}`);
			const audits = await db
				.select({ id: systemAuditLogs.id })
				.from(systemAuditLogs)
				.where(sql`${systemAuditLogs.metadata}->>'marker' = ${marker}`);
			expect(events).toHaveLength(0);
			expect(audits).toHaveLength(0);
		},
	);

	test.skipIf(suite === null)(
		"updating an audit row is rejected and the insert rolls back",
		async () => {
			if (!suite) return;
			const { db } = suite;
			const marker = `immutable-${crypto.randomUUID()}`;
			let thrown: unknown;
			try {
				await db.transaction(async (tx) => {
					await writeAudit(tx, {
						action: "test.immutable",
						metadata: { marker },
					});
					await tx.execute(
						sql`update system_audit_logs set action = 'changed' where metadata->>'marker' = ${marker}`,
					);
				});
			} catch (error) {
				thrown = error;
			}
			expect(errorText(thrown)).toContain("append-only");

			const audits = await db
				.select({ id: systemAuditLogs.id })
				.from(systemAuditLogs)
				.where(sql`${systemAuditLogs.metadata}->>'marker' = ${marker}`);
			expect(audits).toHaveLength(0);
		},
	);

	test.skipIf(suite === null)(
		"deleting an audit row is rejected and the insert rolls back",
		async () => {
			if (!suite) return;
			const { db } = suite;
			const marker = `immutable-delete-${crypto.randomUUID()}`;
			let thrown: unknown;
			try {
				await db.transaction(async (tx) => {
					await writeAudit(tx, {
						action: "test.immutable",
						metadata: { marker },
					});
					await tx.execute(
						sql`delete from system_audit_logs where metadata->>'marker' = ${marker}`,
					);
				});
			} catch (error) {
				thrown = error;
			}
			expect(errorText(thrown)).toContain("append-only");

			const audits = await db
				.select({ id: systemAuditLogs.id })
				.from(systemAuditLogs)
				.where(sql`${systemAuditLogs.metadata}->>'marker' = ${marker}`);
			expect(audits).toHaveLength(0);
		},
	);
});
