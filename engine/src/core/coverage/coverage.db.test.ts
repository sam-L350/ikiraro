import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	districts,
	learningCenters,
	modules,
	provinces,
	roles,
	sectors,
	tasks,
	taskTranslations,
	userRoles,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import { readCoverage } from "./coverage";
import { copyTemplate, createTemplate } from "./templates";
import {
	attendTour,
	createTour,
	createTourSession,
	linkTourHome,
	signUpForTour,
} from "./tours";

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

function reasonOf(error: unknown): string {
	if (isApiError(error)) {
		const details = error.details;
		if (details && typeof details === "object" && "reason" in details) {
			return String(details.reason);
		}
	}
	return "";
}

function statusOf(error: unknown): number {
	return isApiError(error) ? error.status : 0;
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe.serial("coverage, tours, and templates", () => {
	test("a pop-up links a learner home, and a template becomes a draft", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const root = suite.db;
		try {
			await root.transaction(async (db) => {
				await exercise(db);
				throw new Error("rollback");
			});
		} catch (error) {
			if (!(error instanceof Error) || error.message !== "rollback")
				throw error;
		}

		async function exercise(db: Parameters<typeof createTour>[0]) {
			const stamp = Date.now().toString(36);
			const coordinator = await createUserWithPassport(db, {
				email: `coverage-coordinator-${stamp}@demo.ikiraro.test`,
				name: "Coverage coordinator",
			});
			const author = await createUserWithPassport(db, {
				email: `coverage-author-${stamp}@demo.ikiraro.test`,
				name: "Coverage author",
			});
			const learner = await createUserWithPassport(db, {
				email: `coverage-learner-${stamp}@demo.ikiraro.test`,
				name: `Coverage learner ${stamp}`,
			});
			const second = await createUserWithPassport(db, {
				email: `coverage-second-${stamp}@demo.ikiraro.test`,
				name: `Second learner ${stamp}`,
			});
			const [province] = await db
				.insert(provinces)
				.values({ code: `cv-${stamp}`, name: "Coverage province" })
				.returning({ id: provinces.id });
			const [district] = await db
				.insert(districts)
				.values({
					provinceId: province?.id ?? "",
					code: `cvd-${stamp}`,
					name: "Coverage district",
				})
				.returning({ id: districts.id });
			const [openSector] = await db
				.insert(sectors)
				.values({
					districtId: district?.id ?? "",
					code: `cvo-${stamp}`,
					name: `Open ${stamp}`,
				})
				.returning({ id: sectors.id, name: sectors.name });
			const [served] = await db
				.insert(sectors)
				.values({
					districtId: district?.id ?? "",
					code: `cvs-${stamp}`,
					name: `Served ${stamp}`,
				})
				.returning({ id: sectors.id });
			await db.insert(sectors).values({
				districtId: district?.id ?? "",
				code: `cve-${stamp}`,
				name: `Empty ${stamp}`,
			});
			const [center] = await db
				.insert(learningCenters)
				.values({
					sectorId: served?.id ?? "",
					name: `Home ${stamp}`,
				})
				.returning({ id: learningCenters.id, name: learningCenters.name });
			if (!district || !openSector || !center) {
				throw new Error("The center was not stored.");
			}
			const roleRows = await db
				.select({ id: roles.id, code: roles.code })
				.from(roles);
			const roleId = (code: string) => {
				const row = roleRows.find((item) => item.code === code);
				if (!row) throw new Error("A role was not found.");
				return row.id;
			};
			await db.insert(userRoles).values([
				{
					userId: learner.userId,
					roleId: roleId("learner"),
					scopeType: "self",
					scopeId: null,
				},
				{
					userId: second.userId,
					roleId: roleId("learner"),
					scopeType: "self",
					scopeId: null,
				},
			]);
			await db
				.update(users)
				.set({ sector: openSector.name })
				.where(eq(users.id, learner.userId));
			const planner = [
				{
					role: "district_coordinator" as const,
					scopeType: "district" as const,
					scopeId: district.id,
				},
			];
			const learnerRole = [
				{ role: "learner" as const, scopeType: "self" as const, scopeId: null },
			];
			const writer = [
				{
					role: "content_author" as const,
					scopeType: "global" as const,
					scopeId: "global",
				},
			];
			try {
				await readCoverage(db, learnerRole);
				throw new Error("expected a learner to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(403);
				expect(reasonOf(error)).toBe("coverage");
			}
			try {
				await createTour(db, {
					actorId: learner.userId,
					assignments: learnerRole,
					place: "Market",
					homeCenterId: center.id,
					ip: "127.0.0.1",
				});
				throw new Error("expected a learner to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(403);
				expect(reasonOf(error)).toBe("tour");
			}
			try {
				await createTour(db, {
					actorId: coordinator.userId,
					assignments: planner,
					place: " ",
					homeCenterId: center.id,
					ip: "127.0.0.1",
				});
				throw new Error("expected a blank place to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("tour");
			}
			const tour = await createTour(db, {
				actorId: coordinator.userId,
				assignments: planner,
				place: `Market ${stamp}`,
				homeCenterId: center.id,
				ip: "127.0.0.1",
			});
			try {
				await createTourSession(db, {
					actorId: coordinator.userId,
					assignments: planner,
					tourId: tour.id,
					topic: "Introduce the books",
					startsAt: "2000-01-01T00:00:00.000Z",
					minutes: 60,
					capacity: 1,
					ip: "127.0.0.1",
				});
				throw new Error("expected a past session to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("tour");
			}
			const session = await createTourSession(db, {
				actorId: coordinator.userId,
				assignments: planner,
				tourId: tour.id,
				topic: "Introduce the books",
				startsAt: "2099-06-01T09:00:00.000Z",
				minutes: 60,
				capacity: 1,
				ip: "127.0.0.1",
			});
			try {
				await linkTourHome(db, {
					actorId: coordinator.userId,
					assignments: planner,
					tourId: tour.id,
					userId: learner.userId,
					ip: "127.0.0.1",
				});
				throw new Error("expected a link before attendance to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("tour");
			}
			await signUpForTour(db, {
				userId: learner.userId,
				assignments: learnerRole,
				sessionId: session.id,
				ip: "127.0.0.1",
			});
			try {
				await signUpForTour(db, {
					userId: learner.userId,
					assignments: learnerRole,
					sessionId: session.id,
					ip: "127.0.0.1",
				});
				throw new Error("expected a second signup to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(409);
				expect(reasonOf(error)).toBe("tour");
			}
			try {
				await signUpForTour(db, {
					userId: second.userId,
					assignments: learnerRole,
					sessionId: session.id,
					ip: "127.0.0.1",
				});
				throw new Error("expected a full session to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(409);
				expect(reasonOf(error)).toBe("tour");
			}
			await attendTour(db, {
				actorId: coordinator.userId,
				assignments: planner,
				sessionId: session.id,
				userId: learner.userId,
				ip: "127.0.0.1",
			});
			await linkTourHome(db, {
				actorId: coordinator.userId,
				assignments: planner,
				tourId: tour.id,
				userId: learner.userId,
				ip: "127.0.0.1",
			});
			const [home] = await db
				.select({ centerId: users.centerId })
				.from(users)
				.where(eq(users.id, learner.userId))
				.limit(1);
			expect(home?.centerId).toBe(center.id);
			try {
				await linkTourHome(db, {
					actorId: coordinator.userId,
					assignments: planner,
					tourId: tour.id,
					userId: learner.userId,
					ip: "127.0.0.1",
				});
				throw new Error("expected a second link to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(409);
				expect(reasonOf(error)).toBe("tour");
			}
			const coverage = await readCoverage(db, planner);
			const open = coverage.sectors.find(
				(row) => row.sector === openSector.name && row.learners === 1,
			);
			expect(open?.homeCenter).toBe(center.name);
			expect(
				coverage.sectors.some((row) => row.sector === `Served ${stamp}`),
			).toBe(false);
			expect(
				coverage.sectors.some(
					(row) => row.sector === `Empty ${stamp}` && row.learners === 0,
				),
			).toBe(true);
			try {
				await createTemplate(db, {
					actorId: author.userId,
					assignments: writer,
					name: " ",
					titleEn: "Crop log",
					ip: "127.0.0.1",
				});
				throw new Error("expected a blank template name to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("template");
			}
			try {
				await createTemplate(db, {
					actorId: learner.userId,
					assignments: learnerRole,
					name: "Crop log",
					titleEn: "Crop log",
					ip: "127.0.0.1",
				});
				throw new Error("expected a learner to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(403);
				expect(reasonOf(error)).toBe("template");
			}
			const template = await createTemplate(db, {
				actorId: author.userId,
				assignments: writer,
				name: `Crop log ${stamp}`,
				titleEn: "Keep a crop log",
				evidenceType: "note",
				ip: "127.0.0.1",
			});
			const used = await copyTemplate(db, {
				actorId: author.userId,
				assignments: writer,
				templateId: template.id,
				ip: "127.0.0.1",
			});
			const copied = await db
				.select({
					evidenceType: tasks.evidenceType,
					title: taskTranslations.title,
				})
				.from(tasks)
				.innerJoin(modules, eq(modules.id, tasks.moduleId))
				.innerJoin(
					taskTranslations,
					and(
						eq(taskTranslations.taskId, tasks.id),
						eq(taskTranslations.locale, "en"),
					),
				)
				.where(eq(modules.courseId, used.courseId));
			expect(copied[0]?.evidenceType).toBe("note");
			expect(copied[0]?.title).toBe("Keep a crop log");
		}
	}, 120_000);
});
