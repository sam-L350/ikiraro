import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	districts,
	mentorMessages,
	provinces,
	roles,
	userRoles,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { previewAssignment } from "../authz/preview";
import { recordConsent } from "../identity/consent";
import { createUserWithPassport } from "../identity/create-user";
import {
	acceptMentorRequest,
	applyToMentor,
	approveMentor,
	optInToMentors,
	requestLearner,
} from "./mentors";
import {
	blockMentorMatch,
	listMessageReview,
	readThread,
	recordSafeguarding,
	reportMentorMessage,
	sendMentorMessage,
	shareMentorContact,
} from "./messages";

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
	if (error instanceof Error && error.cause) return errorText(error.cause);
	return String(error);
}

async function reasonOf(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
	} catch (error) {
		if (isApiError(error)) {
			const details = error.details;
			if (details && typeof details === "object" && "reason" in details) {
				return String(details.reason);
			}
		}
		throw error;
	}
	throw new Error("the call was allowed");
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe.serial("mentor messages", () => {
	test("contact details stay hidden until both agree, and a minor needs the extra check", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const admin = await createUserWithPassport(db, {
			email: `msg-admin-${stamp}@demo.ikiraro.test`,
			name: "Message admin",
		});
		const mentor = await createUserWithPassport(db, {
			email: `msg-mentor-${stamp}@demo.ikiraro.test`,
			name: "Message mentor",
			phone: "+250780000111",
		});
		const learner = await createUserWithPassport(db, {
			email: `msg-learner-${stamp}@demo.ikiraro.test`,
			name: "Message learner",
			phone: "+250780000222",
		});
		const stranger = await createUserWithPassport(db, {
			email: `msg-stranger-${stamp}@demo.ikiraro.test`,
			name: "Message stranger",
		});
		await db
			.update(users)
			.set({ dateOfBirth: "1993-02-02", phone: "+250780000222" })
			.where(eq(users.id, learner.userId));
		await db
			.update(users)
			.set({ phone: "+250780000111" })
			.where(eq(users.id, mentor.userId));
		const [adminRole] = await db
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.code, "platform_admin"))
			.limit(1);
		if (!adminRole) throw new Error("the admin role is missing");
		const scope = previewAssignment("platform_admin", admin.userId);
		await db.insert(userRoles).values({
			userId: admin.userId,
			roleId: adminRole.id,
			scopeType: scope.scopeType,
			scopeId: scope.scopeId,
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `mg-${stamp}`, name: `Message province ${stamp}` })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `md-${stamp}`,
				name: `Message district ${stamp}`,
			})
			.returning({ id: districts.id });
		if (!district) throw new Error("the district was not stored");
		const application = await applyToMentor(db, {
			userId: mentor.userId,
			kind: "mentor",
			weeklyContactCap: 2,
		});
		await approveMentor(db, {
			actorId: admin.userId,
			mentorId: application.id,
		});
		await recordConsent(db, {
			userId: learner.userId,
			purpose: "mentor_contact",
			granted: true,
		});
		const choice = await optInToMentors(db, {
			userId: learner.userId,
			skill: "Repair",
			districtId: district.id,
		});
		const asked = await requestLearner(db, {
			userId: mentor.userId,
			optInId: choice.id,
		});
		await acceptMentorRequest(db, {
			userId: learner.userId,
			requestId: asked.id,
		});
		expect(
			await reasonOf(() =>
				sendMentorMessage(db, {
					userId: stranger.userId,
					requestId: asked.id,
					body: "Hello",
				}),
			),
		).toBe("self");
		expect(
			await reasonOf(() =>
				sendMentorMessage(db, {
					userId: mentor.userId,
					requestId: asked.id,
					body: "   ",
				}),
			),
		).toBe("body");
		const sent = await sendMentorMessage(db, {
			userId: mentor.userId,
			requestId: asked.id,
			body: "Hello from the mentor.",
		});
		const hidden = await readThread(db, {
			userId: learner.userId,
			requestId: asked.id,
		});
		expect(hidden.contact).toBeNull();
		await shareMentorContact(db, {
			userId: mentor.userId,
			requestId: asked.id,
		});
		expect(
			(await readThread(db, { userId: learner.userId, requestId: asked.id }))
				.contact,
		).toBeNull();
		await shareMentorContact(db, {
			userId: learner.userId,
			requestId: asked.id,
		});
		const open = await readThread(db, {
			userId: learner.userId,
			requestId: asked.id,
		});
		expect(open.contact).toEqual({
			phone: "+250780000111",
			email: `msg-mentor-${stamp}@demo.ikiraro.test`,
		});
		await reportMentorMessage(db, {
			userId: learner.userId,
			messageId: sent.id,
			note: "Please review this message.",
		});
		const review = await listMessageReview(db);
		expect(review.messages.some((row) => row.id === sent.id)).toBe(true);
		expect(review.reports.some((row) => row.messageId === sent.id)).toBe(true);
		await db
			.update(users)
			.set({ dateOfBirth: "2014-02-02" })
			.where(eq(users.id, learner.userId));
		expect(
			await reasonOf(() =>
				sendMentorMessage(db, {
					userId: mentor.userId,
					requestId: asked.id,
					body: "Another note.",
				}),
			),
		).toBe("safeguarding");
		expect(
			await reasonOf(() =>
				recordSafeguarding(db, {
					actorId: mentor.userId,
					mentorUserId: mentor.userId,
					note: "I checked the guardian and the center.",
				}),
			),
		).toBe("self");
		await recordSafeguarding(db, {
			actorId: admin.userId,
			mentorUserId: mentor.userId,
			note: "I checked the guardian and the center.",
		});
		await sendMentorMessage(db, {
			userId: mentor.userId,
			requestId: asked.id,
			body: "The check is recorded.",
		});
		await blockMentorMatch(db, { userId: learner.userId, requestId: asked.id });
		expect(
			await reasonOf(() =>
				sendMentorMessage(db, {
					userId: mentor.userId,
					requestId: asked.id,
					body: "After the block.",
				}),
			),
		).toBe("block");
		try {
			await db
				.update(mentorMessages)
				.set({ body: "Changed." })
				.where(eq(mentorMessages.id, sent.id));
			throw new Error("the message was edited");
		} catch (error) {
			expect(errorText(error).includes("append-only")).toBe(true);
		}
	}, 120_000);
});
