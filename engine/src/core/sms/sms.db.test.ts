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
	domainEvents,
	learningCenters,
	notifications,
	sectors,
	smsCharges,
	users,
} from "../../db/schema";
import { insertUserWithPassport } from "../identity/create-user";
import { drainNotifications } from "../notifications/drain";
import type { EmailSender } from "../notifications/email";
import { readDailyCap } from "./cap";
import { applyDeliveryReceipt } from "./receipts";
import type { SmsSender } from "./sender";

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

const holdingEmail: EmailSender = {
	async send() {
		return "not_configured";
	},
};

describe("sms production", () => {
	test(
		"a daily cap holds the text, and a receipt is what marks it sent",
		async () => {
			useTestEnv();
			if (!suite) return;
			const database = suite.db;
			const suffix = crypto.randomUUID().slice(0, 8);
			const [sector] = await database
				.select({ id: sectors.id })
				.from(sectors)
				.limit(1);
			if (!sector) throw new Error("geography is missing");
			const [center] = await database
				.insert(learningCenters)
				.values({ sectorId: sector.id, name: `Sms ${suffix}` })
				.returning({ id: learningCenters.id });
			if (!center) throw new Error("center missing");
			const phone = `+2507${suffix.replace(/\D/g, "").padEnd(8, "2").slice(0, 8)}`;
			const learner = await insertUserWithPassport(database, {
				email: `sms-learner-${suffix}@example.test`,
				name: "Keza",
				phone,
			});
			await database
				.update(users)
				.set({ centerId: center.id, locale: "en" })
				.where(eq(users.id, learner.userId));
			const cap = await readDailyCap(database);
			const [cappedEvent] = await database
				.insert(domainEvents)
				.values({
					name: "grant.decided",
					payload: { userId: learner.userId },
					processedAt: new Date(),
				})
				.returning({ id: domainEvents.id });
			const [openEvent] = await database
				.insert(domainEvents)
				.values({
					name: "grant.decided",
					payload: { userId: learner.userId, kind: "open" },
					processedAt: new Date(),
				})
				.returning({ id: domainEvents.id });
			if (!cappedEvent || !openEvent) throw new Error("events missing");
			const [capped] = await database
				.insert(notifications)
				.values({
					userId: learner.userId,
					eventId: cappedEvent.id,
					eventName: "grant.decided",
					channel: "sms",
					title: "Grant",
					body: "A grant was decided.",
					status: "queued",
				})
				.returning({ id: notifications.id });
			const [waiting] = await database
				.insert(notifications)
				.values({
					userId: learner.userId,
					eventId: openEvent.id,
					eventName: "grant.decided",
					channel: "sms",
					title: "Grant",
					body: "Another grant was decided.",
					status: "queued",
				})
				.returning({ id: notifications.id });
			if (!capped || !waiting) throw new Error("notices missing");
			if (cap > 0) {
				await database.insert(smsCharges).values(
					Array.from({ length: cap }, (_, index) => ({
						userId: learner.userId,
						centerId: center.id,
						notificationId: capped.id,
						provider: "africastalking",
						providerMessageId: `ATXid_cap_${suffix}_${index}`,
						currency: "RWF",
						amount: 1,
						status: "accepted" as const,
					})),
				);
			}
			let sends = 0;
			const blocking: SmsSender = {
				async send() {
					sends += 1;
				},
			};
			await database
				.update(notifications)
				.set({
					status: "queued",
					attempts: 0,
					lastError: null,
					providerMessageId: null,
				})
				.where(eq(notifications.id, capped.id));
			await drainNotifications(
				database,
				{ sms: blocking, email: holdingEmail },
				{ eventIds: [cappedEvent.id], sweepStalled: false },
			);
			const [held] = await database
				.select({
					status: notifications.status,
					attempts: notifications.attempts,
					lastError: notifications.lastError,
				})
				.from(notifications)
				.where(eq(notifications.id, capped.id));
			expect(held?.status).toBe("queued");
			expect(held?.lastError).toBe("daily_cap");
			expect(held?.attempts).toBe(0);
			expect(sends).toBe(0);

			const messageId = `ATXid_open_${suffix}`;
			const accepting: SmsSender = {
				async send() {
					return {
						provider: "africastalking",
						providerMessageId: messageId,
						currency: "RWF",
						amount: 10,
					};
				},
			};
			await database
				.update(notifications)
				.set({
					status: "queued",
					attempts: 0,
					lastError: null,
					providerMessageId: null,
				})
				.where(eq(notifications.id, waiting.id));
			await database
				.delete(smsCharges)
				.where(eq(smsCharges.notificationId, capped.id));
			await drainNotifications(
				database,
				{ sms: accepting, email: holdingEmail },
				{ eventIds: [openEvent.id], sweepStalled: false },
			);
			const [submitted] = await database
				.select({
					status: notifications.status,
					providerMessageId: notifications.providerMessageId,
				})
				.from(notifications)
				.where(eq(notifications.id, waiting.id));
			expect(submitted?.status).toBe("submitted");
			expect(submitted?.providerMessageId).toBe(messageId);
			const [charge] = await database
				.select({
					centerId: smsCharges.centerId,
					amount: smsCharges.amount,
					currency: smsCharges.currency,
					status: smsCharges.status,
				})
				.from(smsCharges)
				.where(eq(smsCharges.providerMessageId, messageId));
			expect(charge).toEqual({
				centerId: center.id,
				amount: 10,
				currency: "RWF",
				status: "accepted",
			});
			await applyDeliveryReceipt(database, {
				id: messageId,
				status: "Success",
				failureReason: null,
			});
			const [delivered] = await database
				.select({ status: notifications.status })
				.from(notifications)
				.where(eq(notifications.id, waiting.id));
			const [spent] = await database
				.select({ status: smsCharges.status })
				.from(smsCharges)
				.where(eq(smsCharges.providerMessageId, messageId));
			expect(delivered?.status).toBe("sent");
			expect(spent?.status).toBe("delivered");

			const failedId = `ATXid_fail_${suffix}`;
			await database
				.update(notifications)
				.set({
					status: "submitted",
					providerMessageId: failedId,
					attempts: 0,
				})
				.where(eq(notifications.id, waiting.id));
			await database.insert(smsCharges).values({
				userId: learner.userId,
				centerId: center.id,
				notificationId: waiting.id,
				provider: "africastalking",
				providerMessageId: failedId,
				currency: "RWF",
				amount: 10,
				status: "accepted",
			});
			await applyDeliveryReceipt(database, {
				id: failedId,
				status: "Failed",
				failureReason: "DeliveryFailure",
			});
			const [retried] = await database
				.select({
					status: notifications.status,
					attempts: notifications.attempts,
					providerMessageId: notifications.providerMessageId,
					lastError: notifications.lastError,
				})
				.from(notifications)
				.where(eq(notifications.id, waiting.id));
			expect(retried?.status).toBe("queued");
			expect(retried?.attempts).toBe(1);
			expect(retried?.providerMessageId).toBeNull();
			expect(retried?.lastError).toBe("DeliveryFailure");
			const unknown = await applyDeliveryReceipt(database, {
				id: `ATXid_missing_${suffix}`,
				status: "Success",
				failureReason: null,
			});
			expect(unknown.matched).toBe(false);
		},
		{ timeout: 90_000 },
	);
});
