import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestEnv } from "../../../test/helpers";
import * as schema from "../../db/schema";
import {
	pointAdjustments,
	pointTransactions,
	roles,
	userRoles,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { insertUserWithPassport } from "../identity/create-user";
import {
	approvePointAdjustment,
	rejectPointAdjustment,
	requestPointAdjustment,
} from "./adjustments";
import { listPointStatement } from "./points";

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

async function statusOf(run: () => Promise<unknown>): Promise<number> {
	try {
		await run();
		return 200;
	} catch (error) {
		if (!isApiError(error)) throw error;
		return error.status;
	}
}

describe("manual point adjustments", () => {
	test("a second admin writes one ledger row, and the requester cannot", async () => {
		useTestEnv();
		if (!suite) return;
		const database = suite.db;
		const suffix = crypto.randomUUID().slice(0, 8);
		const learner = await insertUserWithPassport(database, {
			email: `adjust-learner-${suffix}@example.test`,
			name: "Aline",
		});
		const first = await insertUserWithPassport(database, {
			email: `adjust-admin-a-${suffix}@example.test`,
			name: "Admin A",
		});
		const second = await insertUserWithPassport(database, {
			email: `adjust-admin-b-${suffix}@example.test`,
			name: "Admin B",
		});
		const [role] = await database
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.code, "platform_admin"))
			.limit(1);
		if (!role) throw new Error("platform admin role is missing");
		await database.insert(userRoles).values([
			{
				userId: first.userId,
				roleId: role.id,
				scopeType: "global",
				scopeId: "global",
			},
			{
				userId: second.userId,
				roleId: role.id,
				scopeType: "global",
				scopeId: "global",
			},
		]);
		expect(
			await statusOf(() =>
				requestPointAdjustment(database, {
					actorId: first.userId,
					email: learner.userId.toString(),
					amount: 15,
					reason: "   ",
					ip: "127.0.0.1",
				}),
			),
		).toBe(400);
		expect(
			await statusOf(() =>
				requestPointAdjustment(database, {
					actorId: first.userId,
					email: `adjust-learner-${suffix}@example.test`,
					amount: 0,
					reason: "A correction.",
					ip: "127.0.0.1",
				}),
			),
		).toBe(400);
		const asked = await requestPointAdjustment(database, {
			actorId: first.userId,
			email: `Adjust-Learner-${suffix}@example.test`,
			amount: 15,
			reason: "  The center recorded the wrong total.  ",
			ip: "127.0.0.1",
		});
		const before = await database
			.select({ id: pointTransactions.id })
			.from(pointTransactions)
			.where(eq(pointTransactions.userId, learner.userId));
		expect(before).toHaveLength(0);
		expect(
			await statusOf(() =>
				approvePointAdjustment(database, {
					id: asked.id,
					actorId: first.userId,
					ip: "127.0.0.1",
				}),
			),
		).toBe(403);
		const approved = await approvePointAdjustment(database, {
			id: asked.id,
			actorId: second.userId,
			ip: "127.0.0.1",
		});
		expect(approved.status).toBe("approved");
		const ledger = await database
			.select({
				id: pointTransactions.id,
				amount: pointTransactions.amount,
				kind: pointTransactions.kind,
				referenceType: pointTransactions.referenceType,
				referenceId: pointTransactions.referenceId,
				approvedBy: pointTransactions.approvedByUserId,
			})
			.from(pointTransactions)
			.where(eq(pointTransactions.userId, learner.userId));
		expect(ledger).toHaveLength(1);
		expect(ledger[0]?.kind).toBe("manual_adjustment");
		expect(ledger[0]?.amount).toBe(15);
		expect(ledger[0]?.referenceType).toBe("adjustment");
		expect(ledger[0]?.referenceId).toBe(asked.id);
		expect(ledger[0]?.approvedBy).toBe(second.userId);
		const statement = await listPointStatement(database, learner.userId);
		expect(statement.balance).toBe(15);
		expect(statement.entries[0]?.reason).toBe(
			"The center recorded the wrong total.",
		);
		expect(
			await statusOf(() =>
				approvePointAdjustment(database, {
					id: asked.id,
					actorId: second.userId,
					ip: "127.0.0.1",
				}),
			),
		).toBe(409);
		const removed = await requestPointAdjustment(database, {
			actorId: first.userId,
			email: `adjust-learner-${suffix}@example.test`,
			amount: -4,
			reason: "Take back the extra points.",
			ip: "127.0.0.1",
		});
		const keptId = ledger[0]?.id;
		await approvePointAdjustment(database, {
			id: removed.id,
			actorId: second.userId,
			ip: "127.0.0.1",
		});
		const after = await database
			.select({
				id: pointTransactions.id,
				amount: pointTransactions.amount,
			})
			.from(pointTransactions)
			.where(eq(pointTransactions.userId, learner.userId));
		expect(after).toHaveLength(2);
		expect(after.find((row) => row.id === keptId)?.amount).toBe(15);
		expect(after.reduce((sum, row) => sum + row.amount, 0)).toBe(11);
		const declined = await requestPointAdjustment(database, {
			actorId: first.userId,
			email: `adjust-learner-${suffix}@example.test`,
			amount: 9,
			reason: "This one should not land.",
			ip: "127.0.0.1",
		});
		await rejectPointAdjustment(database, {
			id: declined.id,
			actorId: second.userId,
			reason: "The note does not match the register.",
			ip: "127.0.0.1",
		});
		const [stored] = await database
			.select({ status: pointAdjustments.status })
			.from(pointAdjustments)
			.where(eq(pointAdjustments.id, declined.id))
			.limit(1);
		expect(stored?.status).toBe("rejected");
		const finalRows = await database
			.select({ id: pointTransactions.id })
			.from(pointTransactions)
			.where(eq(pointTransactions.userId, learner.userId));
		expect(finalRows).toHaveLength(2);
	}, 60_000);
});
