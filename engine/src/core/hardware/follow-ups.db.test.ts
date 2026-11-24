import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	allocationRounds,
	centerStaff,
	committeeDecisions,
	declaredRelationships,
	districts,
	followUpVerifications,
	hardwareGrants,
	hardwareInventory,
	learningCenters,
	mediaObjects,
	provinces,
	rankingSnapshots,
	roundApplications,
	sectors,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import {
	addDays,
	answerFollowUp,
	askDueFollowUps,
	closeFollowUpReview,
	dueEventCount,
	listOwnFollowUps,
	listReviewQueue,
	recordSilence,
	reviewFollowUpEvidence,
	submitFollowUpEvidence,
} from "./follow-ups";

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

function errorText(error: unknown): string {
	if (error instanceof Error && error.cause) return errorText(error.cause);
	return String(error);
}

function daysAgo(days: number): string {
	const utc = new Date();
	utc.setUTCDate(utc.getUTCDate() - days);
	return utc.toISOString().slice(0, 10);
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe.serial("follow-ups", () => {
	test("a due check-in is asked once, a silent one opens a review, and evidence is decided once", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const officer = await createUserWithPassport(db, {
			email: `follow-officer-${stamp}@demo.ikiraro.test`,
			name: "Follow officer",
		});
		const recipient = await createUserWithPassport(db, {
			email: `follow-learner-${stamp}@demo.ikiraro.test`,
			name: "Follow learner",
		});
		const trainer = await createUserWithPassport(db, {
			email: `follow-trainer-${stamp}@demo.ikiraro.test`,
			name: "Follow trainer",
		});
		const relative = await createUserWithPassport(db, {
			email: `follow-relative-${stamp}@demo.ikiraro.test`,
			name: "Follow relative",
		});
		const stranger = await createUserWithPassport(db, {
			email: `follow-stranger-${stamp}@demo.ikiraro.test`,
			name: "Follow stranger",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `fp-${stamp}`, name: `Follow province ${stamp}` })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `fd-${stamp}`,
				name: `Follow district ${stamp}`,
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `fs-${stamp}`,
				name: `Follow sector ${stamp}`,
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Follow center ${stamp}` })
			.returning({ id: learningCenters.id });
		if (!district || !center) throw new Error("the center was not stored");
		const centerId = center.id;
		const districtId = district.id;
		await db
			.update(users)
			.set({ centerId })
			.where(eq(users.id, recipient.userId));
		await db.insert(centerStaff).values([
			{ centerId, userId: trainer.userId, role: "trainer" },
			{ centerId, userId: relative.userId, role: "trainer" },
		]);
		await db.insert(declaredRelationships).values({
			userId: relative.userId,
			relatedUserId: recipient.userId,
			kind: "household",
		});
		const awardedOn = daysAgo(40);
		async function grant(awarded: string) {
			const [round] = await db
				.insert(allocationRounds)
				.values({
					districtId,
					title: `Follow round ${crypto.randomUUID().slice(0, 8)}`,
					quantity: 1,
					opensAt: new Date(Date.now() - 60_000),
					closesAt: new Date(Date.now() + 86_400_000),
					criteria: [],
					openedByUserId: officer.userId,
				})
				.returning({ id: allocationRounds.id });
			if (!round) throw new Error("the round was not stored");
			const [item] = await db
				.insert(hardwareInventory)
				.values({
					name: "Follow laptop",
					category: "laptop",
					serial: `FOLLOW-${crypto.randomUUID()}`,
					condition: "good",
					status: "awarded",
					centerId,
					acquiredOn: "2026-01-02",
					createdByUserId: officer.userId,
				})
				.returning({ id: hardwareInventory.id });
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
			if (!item || !application || !snapshot)
				throw new Error("the ask was not stored");
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
			const [created] = await db
				.insert(hardwareGrants)
				.values({
					decisionId: decision.id,
					roundId: round.id,
					applicationId: application.id,
					inventoryId: item.id,
					recipientUserId: recipient.userId,
					approvedByUserId: officer.userId,
					status: "active",
					awardedOn: awarded,
				})
				.returning({ id: hardwareGrants.id });
			if (!created) throw new Error("the grant was not stored");
			return created.id;
		}
		await grant(awardedOn);
		const asked = await askDueFollowUps(db);
		expect(asked).toBeGreaterThan(0);
		const mine = await listOwnFollowUps(db, recipient.userId);
		expect(mine.map((row) => row.day)).toEqual([30, 90, 180]);
		const day30 = mine.find((row) => row.day === 30);
		const day90 = mine.find((row) => row.day === 90);
		const day180 = mine.find((row) => row.day === 180);
		if (!day30 || !day90 || !day180)
			throw new Error("the check-ins were not stored");
		expect(day30.dueOn).toBe(addDays(awardedOn, 30));
		expect(day30.asked).toBe(true);
		expect(day90.asked).toBe(false);
		expect(await dueEventCount(db, day30.id)).toBe(1);
		await askDueFollowUps(db);
		expect(await dueEventCount(db, day30.id)).toBe(1);
		try {
			await answerFollowUp(db, {
				followUpId: day180.id,
				actorId: recipient.userId,
				inUse: true,
				purpose: "Practice",
				ip: "127.0.0.1",
			});
			throw new Error("an early check-in was answered");
		} catch (error) {
			expect(reasonOf(error)).toBe("early");
		}
		try {
			await answerFollowUp(db, {
				followUpId: day30.id,
				actorId: stranger.userId,
				inUse: false,
				ip: "127.0.0.1",
			});
			throw new Error("a stranger answered");
		} catch (error) {
			expect(reasonOf(error)).toBe("self");
		}
		await answerFollowUp(db, {
			followUpId: day30.id,
			actorId: recipient.userId,
			inUse: true,
			purpose: "I record sales.",
			ip: "127.0.0.1",
		});
		const answered = await listOwnFollowUps(db, recipient.userId);
		expect(answered.find((row) => row.day === 30)?.purpose).toBe(
			"I record sales.",
		);
		try {
			await answerFollowUp(db, {
				followUpId: day30.id,
				actorId: recipient.userId,
				inUse: false,
				ip: "127.0.0.1",
			});
			throw new Error("the check-in was answered twice");
		} catch (error) {
			expect(reasonOf(error)).toBe("closed");
		}
		const hash = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
		const [pending] = await db
			.insert(mediaObjects)
			.values({
				ownerUserId: recipient.userId,
				objectKey: `evidence/${crypto.randomUUID()}`,
				contentType: "image/jpeg",
				declaredBytes: 4,
				status: "pending",
			})
			.returning({ id: mediaObjects.id });
		const [ready] = await db
			.insert(mediaObjects)
			.values({
				ownerUserId: recipient.userId,
				objectKey: `evidence/${crypto.randomUUID()}`,
				contentType: "image/jpeg",
				declaredBytes: 4,
				sizeBytes: 4,
				sha256: hash,
				status: "ready",
				finalizedAt: new Date(),
			})
			.returning({ id: mediaObjects.id });
		if (!pending || !ready) throw new Error("the image was not stored");
		try {
			await submitFollowUpEvidence(db, {
				followUpId: day30.id,
				actorId: recipient.userId,
				mediaId: pending.id,
				note: "The stall is open.",
				ip: "127.0.0.1",
			});
			throw new Error("a pending photo was accepted");
		} catch (error) {
			expect(reasonOf(error)).toBe("photo");
		}
		const evidence = await submitFollowUpEvidence(db, {
			followUpId: day30.id,
			actorId: recipient.userId,
			mediaId: ready.id,
			note: "The stall is open.",
			ip: "127.0.0.1",
		});
		try {
			await reviewFollowUpEvidence(db, {
				evidenceId: evidence.id,
				actorId: relative.userId,
				decision: "approved",
				note: "Seen.",
				ip: "127.0.0.1",
			});
			throw new Error("a relative reviewed the evidence");
		} catch (error) {
			expect(reasonOf(error)).toBe("relative");
		}
		const decision = await reviewFollowUpEvidence(db, {
			evidenceId: evidence.id,
			actorId: trainer.userId,
			decision: "approved",
			note: "The photo shows the device in use.",
			ip: "127.0.0.1",
		});
		try {
			await db
				.update(followUpVerifications)
				.set({ note: "Changed." })
				.where(eq(followUpVerifications.id, decision.id));
			throw new Error("the decision was edited");
		} catch (error) {
			expect(errorText(error).includes("append-only")).toBe(true);
		}
		const oldAwarded = daysAgo(100);
		await grant(oldAwarded);
		const before = await listOwnFollowUps(db, recipient.userId);
		const older30 = before.find(
			(row) => row.day === 30 && row.dueOn === addDays(oldAwarded, 30),
		);
		if (!older30) throw new Error("the older check-in was not stored");
		await db
			.update(schema.followUps)
			.set({ askedAt: new Date(Date.now() - 86_400_000) })
			.where(eq(schema.followUps.id, older30.id));
		await askDueFollowUps(db);
		const reviews = await listReviewQueue(db, [districtId]);
		expect(
			reviews.some((row) => row.followUpId === older30.id && row.open),
		).toBe(true);
		const review = reviews.find((row) => row.followUpId === older30.id);
		if (!review) throw new Error("the review was not opened");
		await closeFollowUpReview(db, {
			reviewId: review.reviewId,
			actorId: officer.userId,
			note: "The center will visit.",
			ip: "127.0.0.1",
		});
		try {
			await db
				.update(schema.followUpReviews)
				.set({ note: "Changed." })
				.where(eq(schema.followUpReviews.id, review.reviewId));
			throw new Error("the closed review was edited");
		} catch (error) {
			expect(errorText(error).includes("append-only")).toBe(true);
		}
		const latest = await listOwnFollowUps(db, recipient.userId);
		const waiting180 = latest.find(
			(row) => row.day === 180 && row.dueOn === addDays(oldAwarded, 180),
		);
		if (!waiting180) throw new Error("the last check-in was not stored");
		await db
			.update(schema.followUps)
			.set({ dueOn: daysAgo(1) })
			.where(eq(schema.followUps.id, waiting180.id));
		await askDueFollowUps(db);
		await recordSilence(db, {
			followUpId: waiting180.id,
			actorId: officer.userId,
			ip: "127.0.0.1",
		});
		const after = await listOwnFollowUps(db, recipient.userId);
		expect(after.find((row) => row.id === waiting180.id)?.response).toBe(
			"unresponsive",
		);
	}, 120_000);
});
