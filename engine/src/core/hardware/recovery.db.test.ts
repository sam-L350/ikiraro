import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	allocationRounds,
	committeeDecisions,
	districts,
	grantExceptions,
	hardwareGrants,
	hardwareInventory,
	hardwareRecoveries,
	hardwareStatusHistory,
	learningCenters,
	provinces,
	rankingSnapshots,
	roundApplications,
	sectors,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import {
	agreeConditions,
	approveException,
	listPublicExceptions,
	readRecovery,
	recoverItem,
	rejectException,
	requestException,
	writeConditions,
} from "./recovery";

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

function errorText(error: unknown): string {
	if (error instanceof Error) {
		const cause = "cause" in error ? errorText(error.cause) : "";
		return `${error.message} ${cause}`;
	}
	return "";
}

function reasonOf(error: unknown): string | null {
	if (
		!isApiError(error) ||
		typeof error.details !== "object" ||
		!error.details
	) {
		return null;
	}
	const reason = (error.details as { reason?: unknown }).reason;
	return typeof reason === "string" ? reason : null;
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe.serial("recovery and exceptions", () => {
	test("conditions stay on the grant, a recovery returns the item, and an exception is public only after a second person", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const officer = await createUserWithPassport(db, {
			email: `rec-officer-${stamp}@demo.ikiraro.test`,
			name: "Recovery officer",
		});
		const recipient = await createUserWithPassport(db, {
			email: `rec-recipient-${stamp}@demo.ikiraro.test`,
			name: "Recovery recipient",
		});
		const stranger = await createUserWithPassport(db, {
			email: `rec-stranger-${stamp}@demo.ikiraro.test`,
			name: "Not the recipient",
		});
		const firstAdmin = await createUserWithPassport(db, {
			email: `rec-admin-a-${stamp}@demo.ikiraro.test`,
			name: "First admin",
		});
		const secondAdmin = await createUserWithPassport(db, {
			email: `rec-admin-b-${stamp}@demo.ikiraro.test`,
			name: "Second admin",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `rp-${stamp}`, name: `Recovery province ${stamp}` })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `rd-${stamp}`,
				name: `Recovery district ${stamp}`,
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `rs-${stamp}`,
				name: `Recovery sector ${stamp}`,
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Recovery center ${stamp}` })
			.returning({ id: learningCenters.id });
		if (!center || !district) throw new Error("the center was not stored");
		const centerId = center.id;
		const districtId = district.id;
		const [round] = await db
			.insert(allocationRounds)
			.values({
				districtId,
				title: `Recovery round ${stamp}`,
				quantity: 1,
				opensAt: new Date("2026-01-01T00:00:00.000Z"),
				closesAt: new Date("2026-02-01T00:00:00.000Z"),
				openedByUserId: officer.userId,
			})
			.returning({ id: allocationRounds.id });
		const [item] = await db
			.insert(hardwareInventory)
			.values({
				name: "Recovery laptop",
				category: "laptop",
				serial: `REC-${stamp}`,
				condition: "good",
				status: "awarded",
				centerId,
				donor: "Ada Donor",
				acquiredOn: "2026-01-02",
				createdByUserId: officer.userId,
			})
			.returning({ id: hardwareInventory.id });
		if (!round || !item) throw new Error("the item was not stored");
		await db.insert(hardwareStatusHistory).values({
			inventoryId: item.id,
			status: "awarded",
			centerId,
			recordedByUserId: officer.userId,
		});
		const [application] = await db
			.insert(roundApplications)
			.values({
				roundId: round.id,
				userId: recipient.userId,
				statement: "I will use it for practice.",
				results: [],
			})
			.returning({ id: roundApplications.id });
		const [snapshot] = await db
			.insert(rankingSnapshots)
			.values({
				roundId: round.id,
				body: {},
				recordedByUserId: officer.userId,
			})
			.returning({ id: rankingSnapshots.id });
		if (!application || !snapshot) throw new Error("the ask was not stored");
		const [decision] = await db
			.insert(committeeDecisions)
			.values({
				roundId: round.id,
				applicationId: application.id,
				snapshotId: snapshot.id,
				decision: "awarded",
				reason: "The committee awarded this item.",
				decidedByUserId: officer.userId,
			})
			.returning({ id: committeeDecisions.id });
		if (!decision) throw new Error("the decision was not stored");
		const [grant] = await db
			.insert(hardwareGrants)
			.values({
				decisionId: decision.id,
				roundId: round.id,
				applicationId: application.id,
				inventoryId: item.id,
				recipientUserId: recipient.userId,
				approvedByUserId: officer.userId,
				status: "active",
			})
			.returning({ id: hardwareGrants.id });
		if (!grant) throw new Error("the grant was not stored");
		const words =
			"Keep practicing, send a short update, and return it if you stop.";
		try {
			await writeConditions(db, {
				actorId: officer.userId,
				grantId: grant.id,
				conditions: "   ",
				ip: "127.0.0.1",
			});
			throw new Error("blank conditions were stored");
		} catch (error) {
			expect(reasonOf(error)).toBe("conditions");
		}
		await writeConditions(db, {
			actorId: officer.userId,
			grantId: grant.id,
			conditions: words,
			ip: "127.0.0.1",
		});
		try {
			await agreeConditions(db, {
				actorId: stranger.userId,
				grantId: grant.id,
				ip: "127.0.0.1",
			});
			throw new Error("someone else agreed");
		} catch (error) {
			expect(reasonOf(error)).toBe("self");
		}
		await agreeConditions(db, {
			actorId: recipient.userId,
			grantId: grant.id,
			ip: "127.0.0.1",
		});
		try {
			await writeConditions(db, {
				actorId: officer.userId,
				grantId: grant.id,
				conditions: "Different words.",
				ip: "127.0.0.1",
			});
			throw new Error("agreed words were replaced");
		} catch (error) {
			expect(reasonOf(error)).toBe("closed");
		}
		const before = await readRecovery(db, grant.id);
		expect(before.conditions).toBe(words);
		expect(before.agreed).toBe(true);
		const asked = await requestException(db, {
			actorId: firstAdmin.userId,
			grantId: grant.id,
			reason: "Disability support for this learner.",
			ip: "127.0.0.1",
		});
		try {
			await approveException(db, {
				actorId: firstAdmin.userId,
				exceptionId: asked.id,
				ip: "127.0.0.1",
			});
			throw new Error("the same person approved");
		} catch (error) {
			expect(reasonOf(error)).toBe("self");
		}
		await approveException(db, {
			actorId: secondAdmin.userId,
			exceptionId: asked.id,
			ip: "127.0.0.1",
		});
		const [approved] = await db
			.select({
				publicSummary: grantExceptions.publicSummary,
				status: grantExceptions.status,
			})
			.from(grantExceptions)
			.where(eq(grantExceptions.id, asked.id))
			.limit(1);
		expect(approved?.status).toBe("approved");
		expect(approved?.publicSummary).toBe(true);
		const refused = await requestException(db, {
			actorId: firstAdmin.userId,
			grantId: grant.id,
			reason: "This one should stay private.",
			ip: "127.0.0.1",
		});
		await rejectException(db, {
			actorId: secondAdmin.userId,
			exceptionId: refused.id,
			ip: "127.0.0.1",
		});
		const published = await listPublicExceptions(db);
		expect(
			published.some(
				(row) => row.reason === "Disability support for this learner.",
			),
		).toBe(true);
		expect(
			published.some((row) => row.reason === "This one should stay private."),
		).toBe(false);
		expect(published.every((row) => !("recipientName" in row))).toBe(true);
		let locked = false;
		try {
			await db
				.update(grantExceptions)
				.set({ reason: "changed" })
				.where(eq(grantExceptions.id, asked.id));
		} catch (error) {
			locked = errorText(error).includes("append-only");
			if (!locked) throw error;
		}
		expect(locked).toBe(true);
		const recovery = await recoverItem(db, {
			actorId: officer.userId,
			grantId: grant.id,
			situation: "unused",
			reason: "The learner stopped using it.",
			ip: "127.0.0.1",
		});
		const [storedItem] = await db
			.select({
				status: hardwareInventory.status,
				holder: hardwareInventory.currentHolderUserId,
			})
			.from(hardwareInventory)
			.where(eq(hardwareInventory.id, item.id))
			.limit(1);
		expect(storedItem?.status).toBe("in_stock");
		expect(storedItem?.holder).toBeNull();
		const [storedGrant] = await db
			.select({ status: hardwareGrants.status })
			.from(hardwareGrants)
			.where(eq(hardwareGrants.id, grant.id))
			.limit(1);
		expect(storedGrant?.status).toBe("recovered");
		const history = await db
			.select({
				status: hardwareStatusHistory.status,
				holder: hardwareStatusHistory.holderUserId,
			})
			.from(hardwareStatusHistory)
			.where(eq(hardwareStatusHistory.inventoryId, item.id))
			.orderBy(desc(hardwareStatusHistory.recordedAt));
		expect(history[0]?.status).toBe("in_stock");
		expect(history[0]?.holder).toBeNull();
		try {
			await recoverItem(db, {
				actorId: officer.userId,
				grantId: grant.id,
				situation: "lost",
				reason: "Again.",
				ip: "127.0.0.1",
			});
			throw new Error("the item was recovered twice");
		} catch (error) {
			expect(reasonOf(error)).toBe("closed");
		}
		let recoveryLocked = false;
		try {
			await db
				.update(hardwareRecoveries)
				.set({ reason: "changed" })
				.where(eq(hardwareRecoveries.id, recovery.id));
		} catch (error) {
			recoveryLocked = errorText(error).includes("append-only");
			if (!recoveryLocked) throw error;
		}
		expect(recoveryLocked).toBe(true);
		const after = await readRecovery(db, grant.id);
		expect(after.situation).toBe("unused");
		expect(after.reason).toBe("The learner stopped using it.");
	}, 120_000);
});
