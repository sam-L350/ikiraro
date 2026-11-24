import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	badges,
	contentVersions,
	courses,
	districts,
	earnedBadges,
	enrollments,
	learningCenters,
	modules,
	provinces,
	roles,
	sectors,
	submissionVerifications,
	taskSubmissions,
	tasks,
	userRoles,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { createUserWithPassport } from "../identity/create-user";
import { signAwardedBadge } from "../learning/credentials";
import { readPassport } from "../learning/passport";
import {
	createLicence,
	exportOpenBadge,
	grantLicenceSeat,
	readLicences,
	revokeLicenceSeat,
} from "./portable";

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

describe.serial("portable credentials and licence seats", () => {
	test("a badge carries its level and expiry, and a seat cannot be given twice", async () => {
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

		async function exercise(db: Parameters<typeof createLicence>[0]) {
			const stamp = Date.now().toString(36);
			const email = `portable-learner-${stamp}@demo.ikiraro.test`;
			const officer = await createUserWithPassport(db, {
				email: `portable-officer-${stamp}@demo.ikiraro.test`,
				name: "Portable officer",
			});
			const learner = await createUserWithPassport(db, {
				email,
				name: `Portable learner ${stamp}`,
			});
			const second = await createUserWithPassport(db, {
				email: `portable-second-${stamp}@demo.ikiraro.test`,
				name: `Second learner ${stamp}`,
			});
			const outsider = await createUserWithPassport(db, {
				email: `portable-out-${stamp}@demo.ikiraro.test`,
				name: "Portable outsider",
			});
			const [province] = await db
				.insert(provinces)
				.values({ code: `cp-${stamp}`, name: "Credential province" })
				.returning({ id: provinces.id });
			const [district] = await db
				.insert(districts)
				.values({
					provinceId: province?.id ?? "",
					code: `cd-${stamp}`,
					name: "Credential district",
				})
				.returning({ id: districts.id });
			const [sector] = await db
				.insert(sectors)
				.values({
					districtId: district?.id ?? "",
					code: `cs-${stamp}`,
					name: "Credential sector",
				})
				.returning({ id: sectors.id });
			const [center] = await db
				.insert(learningCenters)
				.values({
					sectorId: sector?.id ?? "",
					name: `Credential center ${stamp}`,
				})
				.returning({ id: learningCenters.id });
			const [course] = await db
				.insert(courses)
				.values({ status: "published", createdByUserId: officer.userId })
				.returning({ id: courses.id });
			const [module] = await db
				.insert(modules)
				.values({
					courseId: course?.id ?? "",
					status: "published",
					position: 1,
				})
				.returning({ id: modules.id });
			const [task] = await db
				.insert(tasks)
				.values({
					moduleId: module?.id ?? "",
					status: "published",
					position: 1,
					evidenceType: "note",
				})
				.returning({ id: tasks.id });
			const [badge] = await db
				.insert(badges)
				.values({
					courseId: course?.id ?? "",
					titleEn: "Keep a ledger",
					titleRw: "Bika igitabo",
					skillEn: "Record a sale",
					skillRw: "Andika igurishwa",
					level: 2,
					validDays: 30,
				})
				.returning({ id: badges.id });
			if (!center || !course || !task || !badge) {
				throw new Error("The badge was not stored.");
			}
			const [version] = await db
				.insert(contentVersions)
				.values({
					courseId: course.id,
					versionNumber: 1,
					snapshot: {
						badge: {
							id: badge.id,
							titleEn: "Keep a ledger",
							titleRw: "Bika igitabo",
							skillEn: "Record a sale",
							skillRw: "Andika igurishwa",
							level: 2,
							validDays: 30,
						},
					},
				})
				.returning({ id: contentVersions.id });
			const [enrollment] = await db
				.insert(enrollments)
				.values({
					userId: learner.userId,
					courseId: course.id,
					contentVersionId: version?.id ?? "",
					centerId: center.id,
				})
				.returning({ id: enrollments.id });
			const submissionId = crypto.randomUUID();
			await db.insert(taskSubmissions).values({
				id: submissionId,
				enrollmentId: enrollment?.id ?? "",
				taskId: task.id,
				contentVersionId: version?.id ?? "",
				ownerUserId: learner.userId,
				attempt: 1,
				status: "approved",
				evidenceType: "note",
			});
			const [verification] = await db
				.insert(submissionVerifications)
				.values({
					submissionId,
					reviewerUserId: officer.userId,
					decision: "approved",
					note: "Seen",
				})
				.returning({ id: submissionVerifications.id });
			await db.insert(earnedBadges).values({
				userId: learner.userId,
				badgeId: badge.id,
				enrollmentId: enrollment?.id ?? "",
				verificationId: verification?.id ?? "",
				entry: "awarded",
			});
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
					userId: officer.userId,
					roleId: roleId("hardware_officer"),
					scopeType: "global",
					scopeId: "global",
				},
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
			const held = await readPassport(db, learner.userId);
			const shown = held.badges[0];
			expect(shown?.level).toBe(2);
			expect(shown?.titleEn).toBe("Keep a ledger");
			if (!shown?.expiresAt) throw new Error("The expiry was not stored.");
			expect(
				new Date(shown.expiresAt).getTime() -
					new Date(shown.awardedAt).getTime(),
			).toBe(30 * 24 * 60 * 60 * 1000);
			await signAwardedBadge(db, {
				verificationId: verification?.id ?? "",
				ip: "127.0.0.1",
			});
			const exported = await exportOpenBadge(db, {
				userId: learner.userId,
				badgeId: badge.id,
			});
			const assertion = JSON.parse(exported.json) as {
				"@context": string;
				type: string;
				expires?: string;
				recipient: { hashed: boolean; identity: string };
				badge: { level: number; name: string };
			};
			expect(assertion["@context"]).toBe("https://w3id.org/openbadges/v2");
			expect(assertion.type).toBe("Assertion");
			expect(assertion.expires).toBe(shown.expiresAt);
			expect(assertion.recipient.hashed).toBe(true);
			expect(assertion.recipient.identity.startsWith("sha256$")).toBe(true);
			expect(assertion.badge.level).toBe(2);
			expect(assertion.badge.name).toBe("Keep a ledger");
			expect(exported.json.includes(email)).toBe(false);
			try {
				await exportOpenBadge(db, {
					userId: second.userId,
					badgeId: badge.id,
				});
				throw new Error("expected another learner to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(404);
			}
			const assignments = [
				{
					role: "hardware_officer" as const,
					scopeType: "global" as const,
					scopeId: "global",
				},
			];
			try {
				await readLicences(db, [
					{ role: "learner", scopeType: "self", scopeId: null },
				]);
				throw new Error("expected a learner to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(403);
				expect(reasonOf(error)).toBe("licence");
			}
			try {
				await createLicence(db, {
					actorId: officer.userId,
					assignments,
					name: " ",
					seats: 1,
					expiresOn: "2099-01-01",
					ip: "127.0.0.1",
				});
				throw new Error("expected a blank name to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("licence");
			}
			try {
				await createLicence(db, {
					actorId: officer.userId,
					assignments,
					name: `Office ${stamp}`,
					seats: 0,
					expiresOn: "2099-01-01",
					ip: "127.0.0.1",
				});
				throw new Error("expected zero seats to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("licence");
			}
			try {
				await createLicence(db, {
					actorId: officer.userId,
					assignments,
					name: `Office ${stamp}`,
					seats: 1,
					expiresOn: "2000-01-01",
					ip: "127.0.0.1",
				});
				throw new Error("expected a past date to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("licence");
			}
			const licence = await createLicence(db, {
				actorId: officer.userId,
				assignments,
				name: `Office ${stamp}`,
				seats: 1,
				expiresOn: "2099-01-01",
				ip: "127.0.0.1",
			});
			try {
				await grantLicenceSeat(db, {
					actorId: officer.userId,
					assignments,
					licenceId: licence.id,
					userId: outsider.userId,
					ip: "127.0.0.1",
				});
				throw new Error("expected someone who is not a learner to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(400);
				expect(reasonOf(error)).toBe("licence");
			}
			const seat = await grantLicenceSeat(db, {
				actorId: officer.userId,
				assignments,
				licenceId: licence.id,
				userId: learner.userId,
				ip: "127.0.0.1",
			});
			try {
				await grantLicenceSeat(db, {
					actorId: officer.userId,
					assignments,
					licenceId: licence.id,
					userId: learner.userId,
					ip: "127.0.0.1",
				});
				throw new Error("expected the same person to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(409);
				expect(reasonOf(error)).toBe("licence");
			}
			try {
				await grantLicenceSeat(db, {
					actorId: officer.userId,
					assignments,
					licenceId: licence.id,
					userId: second.userId,
					ip: "127.0.0.1",
				});
				throw new Error("expected a full licence to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(409);
				expect(reasonOf(error)).toBe("licence");
			}
			const listed = await readLicences(db, assignments);
			const row = listed.licences.find((item) => item.id === licence.id);
			expect(row?.seatsUsed).toBe(1);
			expect(row?.holders[0]?.name).toBe(`Portable learner ${stamp}`);
			expect(row?.expiresOn).toBe("2099-01-01");
			await revokeLicenceSeat(db, {
				actorId: officer.userId,
				assignments,
				grantId: seat.grantId,
				ip: "127.0.0.1",
			});
			try {
				await revokeLicenceSeat(db, {
					actorId: officer.userId,
					assignments,
					grantId: seat.grantId,
					ip: "127.0.0.1",
				});
				throw new Error("expected a second revoke to be refused");
			} catch (error) {
				expect(statusOf(error)).toBe(409);
				expect(reasonOf(error)).toBe("licence");
			}
			const freed = await grantLicenceSeat(db, {
				actorId: officer.userId,
				assignments,
				licenceId: licence.id,
				userId: second.userId,
				ip: "127.0.0.1",
			});
			expect(freed.grantId.length > 0).toBe(true);
		}
	}, 120_000);
});
