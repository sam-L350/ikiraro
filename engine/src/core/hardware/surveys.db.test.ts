import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	centerStaff,
	declaredRelationships,
	districts,
	learningCenters,
	outcomeSurveys,
	provinces,
	sectors,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import {
	confirmSurvey,
	listSurveyQueue,
	readSurveys,
	recordBaseline,
	recordEndline,
} from "./surveys";

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

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

const baseline = {
	digitalConfidence: 2,
	tasksDigital: 1,
	income: 100,
	services: "None yet",
	jobsOrCustomers: 0,
};

const endline = {
	digitalConfidence: 6,
	tasksDigital: 4,
	income: 250,
	services: "Market payments",
	jobsOrCustomers: 3,
};

describe.serial("outcome surveys", () => {
	test("a baseline can be filled in later, the endline shows the change, and a trainer can confirm it", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const learner = await createUserWithPassport(db, {
			email: `survey-learner-${stamp}@demo.ikiraro.test`,
			name: "Survey learner",
			activatedAt: new Date("2024-01-01T00:00:00.000Z"),
		});
		const inactive = await createUserWithPassport(db, {
			email: `survey-inactive-${stamp}@demo.ikiraro.test`,
			name: "Survey inactive",
			activatedAt: null,
		});
		const trainer = await createUserWithPassport(db, {
			email: `survey-trainer-${stamp}@demo.ikiraro.test`,
			name: "Survey trainer",
		});
		const relative = await createUserWithPassport(db, {
			email: `survey-relative-${stamp}@demo.ikiraro.test`,
			name: "Survey relative",
		});
		const [province] = await db
			.insert(provinces)
			.values({ code: `sp-${stamp}`, name: `Survey province ${stamp}` })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `sd-${stamp}`,
				name: `Survey district ${stamp}`,
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `ss-${stamp}`,
				name: `Survey sector ${stamp}`,
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Survey center ${stamp}` })
			.returning({ id: learningCenters.id });
		if (!center) throw new Error("the center was not stored");
		const centerId = center.id;
		await db
			.update(users)
			.set({ centerId })
			.where(eq(users.id, learner.userId));
		await db.insert(centerStaff).values([
			{ centerId, userId: trainer.userId, role: "trainer" },
			{ centerId, userId: relative.userId, role: "trainer" },
		]);
		await db.insert(declaredRelationships).values({
			userId: relative.userId,
			relatedUserId: learner.userId,
			kind: "household",
		});
		try {
			await recordBaseline(db, {
				userId: inactive.userId,
				answers: baseline,
				ip: "127.0.0.1",
			});
			throw new Error("an inactive learner stored a survey");
		} catch (error) {
			expect(reasonOf(error)).toBe("activation");
		}
		try {
			await recordEndline(db, {
				userId: learner.userId,
				answers: endline,
				ip: "127.0.0.1",
			});
			throw new Error("the endline came first");
		} catch (error) {
			expect(reasonOf(error)).toBe("baseline");
		}
		try {
			await recordBaseline(db, {
				userId: learner.userId,
				answers: { ...baseline, digitalConfidence: 11 },
				ip: "127.0.0.1",
			});
			throw new Error("a confidence past 10 was stored");
		} catch (error) {
			expect(reasonOf(error)).toBe("confidence");
		}
		const saved = await recordBaseline(db, {
			userId: learner.userId,
			answers: baseline,
			ip: "127.0.0.1",
		});
		try {
			await recordBaseline(db, {
				userId: learner.userId,
				answers: baseline,
				ip: "127.0.0.1",
			});
			throw new Error("the baseline was stored twice");
		} catch (error) {
			expect(reasonOf(error)).toBe("duplicate");
		}
		await recordEndline(db, {
			userId: learner.userId,
			answers: endline,
			ip: "127.0.0.1",
		});
		const pair = await readSurveys(db, learner.userId);
		expect(pair.change).toEqual({
			digitalConfidence: 4,
			tasksDigital: 3,
			income: 150,
			jobsOrCustomers: 3,
		});
		expect(pair.baseline?.verified).toBe(false);
		const queue = await listSurveyQueue(db, [centerId]);
		expect(queue.some((row) => row.id === saved.id)).toBe(true);
		try {
			await confirmSurvey(db, {
				surveyId: saved.id,
				actorId: relative.userId,
				note: "I know this person.",
				ip: "127.0.0.1",
			});
			throw new Error("a relative confirmed the survey");
		} catch (error) {
			expect(reasonOf(error)).toBe("relative");
		}
		await confirmSurvey(db, {
			surveyId: saved.id,
			actorId: trainer.userId,
			note: "The numbers match the conversation.",
			ip: "127.0.0.1",
		});
		expect((await readSurveys(db, learner.userId)).baseline?.verified).toBe(
			true,
		);
		expect(
			(await listSurveyQueue(db, [centerId])).some(
				(row) => row.id === saved.id,
			),
		).toBe(false);
		try {
			await db
				.update(outcomeSurveys)
				.set({ income: 1 })
				.where(eq(outcomeSurveys.id, saved.id));
			throw new Error("a confirmed survey was edited");
		} catch (error) {
			expect(errorText(error).includes("append-only")).toBe(true);
		}
		try {
			await confirmSurvey(db, {
				surveyId: saved.id,
				actorId: trainer.userId,
				note: "Again.",
				ip: "127.0.0.1",
			});
			throw new Error("the survey was confirmed twice");
		} catch (error) {
			expect(reasonOf(error)).toBe("closed");
		}
	}, 120_000);
});
