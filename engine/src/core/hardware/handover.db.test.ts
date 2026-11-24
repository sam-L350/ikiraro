import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, asc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	allocationRounds,
	centerStaff,
	committeeDecisions,
	districts,
	handoverRecords,
	hardwareGrants,
	hardwareInventory,
	hardwareStatusHistory,
	learningCenters,
	mediaObjects,
	otpChallenges,
	provinces,
	rankingSnapshots,
	roundApplications,
	sectors,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { resetLoginGuards } from "../auth/login";
import { resetRateLimits } from "../guard/rate-limit";
import { createUserWithPassport } from "../identity/create-user";
import type { SmsSender } from "../sms/sender";
import { readHandover, recordHandover, requestHandoverCode } from "./handover";

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

function hash(): string {
	return (
		crypto.randomUUID().replaceAll("-", "") +
		crypto.randomUUID().replaceAll("-", "")
	);
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

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe.serial("handover", () => {
	test("a handover stores the form, the acknowledgment, and a history row that names the recipient", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		resetLoginGuards();
		resetRateLimits();
		const stamp = Date.now().toString(36);
		const phone = `2507${String(Date.now() % 100_000_000).padStart(8, "0")}`;
		const officer = await createUserWithPassport(db, {
			email: `hand-officer-${stamp}@demo.ikiraro.test`,
			name: "Handover officer",
		});
		const recipient = await createUserWithPassport(db, {
			email: `hand-recipient-${stamp}@demo.ikiraro.test`,
			name: "Handover recipient",
			phone,
		});
		const witness = await createUserWithPassport(db, {
			email: `hand-witness-${stamp}@demo.ikiraro.test`,
			name: "Center witness",
		});
		const stranger = await createUserWithPassport(db, {
			email: `hand-stranger-${stamp}@demo.ikiraro.test`,
			name: "Not at the center",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `hp-${stamp}`, name: `Handover province ${stamp}` })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `hd-${stamp}`,
				name: `Handover district ${stamp}`,
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `hs-${stamp}`,
				name: `Handover sector ${stamp}`,
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Handover center ${stamp}` })
			.returning({ id: learningCenters.id });
		if (!center || !district) throw new Error("the center was not stored");
		const centerId = center.id;
		const districtId = district.id;
		await db.insert(centerStaff).values({
			centerId,
			userId: witness.userId,
			role: "trainer",
		});
		async function image(status: "ready" | "pending") {
			const [row] = await db
				.insert(mediaObjects)
				.values({
					ownerUserId: officer.userId,
					objectKey: `evidence/${crypto.randomUUID()}`,
					contentType: "image/jpeg",
					declaredBytes: 4,
					sizeBytes: status === "ready" ? 4 : null,
					sha256: status === "ready" ? hash() : null,
					status,
					finalizedAt: status === "ready" ? new Date() : null,
				})
				.returning({ id: mediaObjects.id });
			if (!row) throw new Error("the image was not stored");
			return row.id;
		}
		async function grant(serial: string) {
			const [item] = await db
				.insert(hardwareInventory)
				.values({
					name: `Laptop ${serial}`,
					category: "laptop",
					serial,
					condition: "good",
					status: "awarded",
					centerId,
					donor: "Ada Donor",
					acquiredOn: "2026-01-02",
					createdByUserId: officer.userId,
				})
				.returning({ id: hardwareInventory.id });
			if (!item) throw new Error("the item was not stored");
			await db.insert(hardwareStatusHistory).values([
				{
					inventoryId: item.id,
					status: "in_stock",
					centerId,
					recordedByUserId: officer.userId,
				},
				{
					inventoryId: item.id,
					status: "awarded",
					centerId,
					recordedByUserId: officer.userId,
				},
			]);
			const [round] = await db
				.insert(allocationRounds)
				.values({
					districtId,
					title: `Handover round ${serial}`,
					quantity: 1,
					opensAt: new Date("2026-01-01T00:00:00.000Z"),
					closesAt: new Date("2026-02-01T00:00:00.000Z"),
					openedByUserId: officer.userId,
				})
				.returning({ id: allocationRounds.id });
			if (!round) throw new Error("the round was not stored");
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
			const [row] = await db
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
			if (!row) throw new Error("the grant was not stored");
			return { grantId: row.id, inventoryId: item.id };
		}
		const first = await grant(`HAND-${stamp}-1`);
		const pending = await image("pending");
		const photo = await image("ready");
		const signature = await image("ready");
		const base = {
			actorId: officer.userId,
			grantId: first.grantId,
			witnessUserId: witness.userId,
			photoMediaId: photo,
			ip: "127.0.0.1",
		};
		try {
			await recordHandover(db, {
				...base,
				photoMediaId: pending,
				acknowledgment: "signature",
				signatureMediaId: signature,
			});
			throw new Error("a pending photo was stored");
		} catch (error) {
			expect(reasonOf(error)).toBe("photo");
		}
		try {
			await recordHandover(db, {
				...base,
				acknowledgment: "signature",
				signatureMediaId: photo,
			});
			throw new Error("one image was used twice");
		} catch (error) {
			expect(reasonOf(error)).toBe("photo");
		}
		try {
			await recordHandover(db, {
				...base,
				witnessUserId: officer.userId,
				acknowledgment: "signature",
				signatureMediaId: signature,
			});
			throw new Error("the officer witnessed their own handover");
		} catch (error) {
			expect(reasonOf(error)).toBe("witness");
		}
		try {
			await recordHandover(db, {
				...base,
				witnessUserId: stranger.userId,
				acknowledgment: "signature",
				signatureMediaId: signature,
			});
			throw new Error("a stranger witnessed the handover");
		} catch (error) {
			expect(reasonOf(error)).toBe("witness");
		}
		const stored = await recordHandover(db, {
			...base,
			acknowledgment: "signature",
			signatureMediaId: signature,
		});
		const detail = await readHandover(db, first.grantId, officer.userId);
		expect(detail.recorded).toBe(true);
		expect(detail.acknowledgment).toBe("signature");
		expect(detail.form?.serial).toBe(`HAND-${stamp}-1`);
		expect(detail.form?.donor).toBe("Ada Donor");
		expect(detail.form?.witnessName).toBe("Center witness");
		expect(detail.trail.map((entry) => entry.holderName)).toEqual([
			null,
			null,
			"Handover recipient",
		]);
		const [item] = await db
			.select({ holder: hardwareInventory.currentHolderUserId })
			.from(hardwareInventory)
			.where(eq(hardwareInventory.id, first.inventoryId))
			.limit(1);
		expect(item?.holder).toBe(recipient.userId);
		const [confirmed] = await db
			.select({ at: hardwareGrants.handoverConfirmedAt })
			.from(hardwareGrants)
			.where(eq(hardwareGrants.id, first.grantId))
			.limit(1);
		expect(confirmed?.at).toBeInstanceOf(Date);
		try {
			await recordHandover(db, {
				...base,
				acknowledgment: "signature",
				signatureMediaId: signature,
			});
			throw new Error("the handover was stored twice");
		} catch (error) {
			expect(reasonOf(error)).toBe("closed");
		}
		let blocked = false;
		try {
			await db
				.update(handoverRecords)
				.set({ acknowledgment: "otp" })
				.where(eq(handoverRecords.id, stored.id));
		} catch (error) {
			blocked = errorText(error).includes("append-only");
			if (!blocked) throw error;
		}
		expect(blocked).toBe(true);
		const second = await grant(`HAND-${stamp}-2`);
		const sms = captureSms();
		await requestHandoverCode(
			db,
			{ actorId: officer.userId, grantId: second.grantId, ip: "127.0.0.1" },
			sms.sender,
		);
		const sent = sms.code();
		const wrong = sent === "000000" ? "111111" : "000000";
		try {
			await recordHandover(db, {
				actorId: officer.userId,
				grantId: second.grantId,
				witnessUserId: witness.userId,
				acknowledgment: "otp",
				code: wrong,
				photoMediaId: await image("ready"),
				ip: "127.0.0.1",
			});
			throw new Error("a wrong code was accepted");
		} catch (error) {
			expect(isApiError(error)).toBe(true);
		}
		const [missed] = await db
			.select({ id: handoverRecords.id })
			.from(handoverRecords)
			.where(eq(handoverRecords.grantId, second.grantId))
			.limit(1);
		expect(missed).toBeUndefined();
		await recordHandover(db, {
			actorId: officer.userId,
			grantId: second.grantId,
			witnessUserId: witness.userId,
			acknowledgment: "otp",
			code: sent,
			photoMediaId: await image("ready"),
			ip: "127.0.0.1",
		});
		const [otpRow] = await db
			.select({
				acknowledgment: handoverRecords.acknowledgment,
				signatureMediaId: handoverRecords.signatureMediaId,
				challengeId: handoverRecords.otpChallengeId,
			})
			.from(handoverRecords)
			.where(eq(handoverRecords.grantId, second.grantId))
			.limit(1);
		expect(otpRow?.acknowledgment).toBe("otp");
		expect(otpRow?.signatureMediaId).toBeNull();
		const [challenge] = await db
			.select({ consumedAt: otpChallenges.consumedAt })
			.from(otpChallenges)
			.where(eq(otpChallenges.id, otpRow?.challengeId ?? ""))
			.limit(1);
		expect(challenge?.consumedAt).toBeInstanceOf(Date);
		const open = await db
			.select({ id: otpChallenges.id })
			.from(otpChallenges)
			.where(
				and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt)),
			);
		expect(open).toEqual([]);
		const history = await db
			.select({ holder: hardwareStatusHistory.holderUserId })
			.from(hardwareStatusHistory)
			.where(eq(hardwareStatusHistory.inventoryId, first.inventoryId))
			.orderBy(asc(hardwareStatusHistory.recordedAt));
		expect(history.map((entry) => entry.holder)).toEqual([
			null,
			null,
			recipient.userId,
		]);
	}, 120_000);
});
