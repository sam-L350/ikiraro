import { afterAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	badgeCredentials,
	badges,
	contentVersions,
	courses,
	digitalPassports,
	districts,
	earnedBadges,
	enrollments,
	learningCenters,
	modules,
	provinces,
	sectors,
	submissionVerifications,
	taskSubmissions,
	tasks,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { resetRateLimits } from "../guard/rate-limit";
import { recordConsent } from "../identity/consent";
import { createUserWithPassport } from "../identity/create-user";
import { checkCredential, signAwardedBadge } from "./credentials";

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

describe.serial("signed credentials", () => {
	test("a token reports authenticity and revocation, and the signed row stays", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const database = suite.db;
		resetRateLimits();
		const stamp = Date.now().toString(36);
		const learner = await createUserWithPassport(database, {
			email: `cred-learner-${stamp}@demo.ikiraro.test`,
			name: "Learner",
		});
		const trainer = await createUserWithPassport(database, {
			email: `cred-trainer-${stamp}@demo.ikiraro.test`,
			name: "Trainer",
		});
		const [province] = await database
			.insert(provinces)
			.values({ code: `cp-${stamp}`, name: "Province" })
			.returning({ id: provinces.id });
		const [district] = await database
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `cd-${stamp}`,
				name: "District",
			})
			.returning({ id: districts.id });
		const [sector] = await database
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `cs-${stamp}`,
				name: "Sector",
			})
			.returning({ id: sectors.id });
		const [center] = await database
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Credential ${stamp}` })
			.returning({ id: learningCenters.id });
		if (!province || !district || !sector || !center) {
			throw new Error("the center was not stored");
		}
		const centerId = center.id;

		async function award(position: number) {
			const [course] = await database
				.insert(courses)
				.values({ status: "published", createdByUserId: trainer.userId })
				.returning({ id: courses.id });
			const [module] = await database
				.insert(modules)
				.values({
					courseId: course?.id ?? "",
					position: 0,
					status: "published",
				})
				.returning({ id: modules.id });
			const [task] = await database
				.insert(tasks)
				.values({
					moduleId: module?.id ?? "",
					position: 0,
					status: "published",
					evidenceType: "note",
				})
				.returning({ id: tasks.id });
			const [version] = await database
				.insert(contentVersions)
				.values({
					courseId: course?.id ?? "",
					versionNumber: 1,
					snapshot: {},
					publishedByUserId: trainer.userId,
				})
				.returning({ id: contentVersions.id });
			const [enrollment] = await database
				.insert(enrollments)
				.values({
					userId: learner.userId,
					courseId: course?.id ?? "",
					contentVersionId: version?.id ?? "",
					centerId,
				})
				.returning({ id: enrollments.id });
			const submissionId = crypto.randomUUID();
			await database.insert(taskSubmissions).values({
				id: submissionId,
				enrollmentId: enrollment?.id ?? "",
				taskId: task?.id ?? "",
				contentVersionId: version?.id ?? "",
				ownerUserId: learner.userId,
				attempt: 1,
				status: "approved",
				evidenceType: "note",
			});
			const [verification] = await database
				.insert(submissionVerifications)
				.values({
					submissionId,
					reviewerUserId: trainer.userId,
					decision: "approved",
					note: "Seen",
				})
				.returning({ id: submissionVerifications.id });
			const [badge] = await database
				.insert(badges)
				.values({
					courseId: course?.id ?? "",
					titleEn: `Badge ${position}`,
					level: 1,
				})
				.returning({ id: badges.id });
			const [earned] = await database
				.insert(earnedBadges)
				.values({
					userId: learner.userId,
					badgeId: badge?.id ?? "",
					enrollmentId: enrollment?.id ?? "",
					verificationId: verification?.id ?? "",
					entry: "awarded",
				})
				.returning({ id: earnedBadges.id });
			if (!course || !verification || !badge || !earned) {
				throw new Error("the badge was not stored");
			}
			return {
				verificationId: verification.id,
				earnedBadgeId: earned.id,
				badgeId: badge.id,
				enrollmentId: enrollment?.id ?? "",
			};
		}

		const first = await award(1);
		const second = await award(2);
		const blank = await reasonOf(() =>
			checkCredential(database, { token: "  ", ip: "cred-blank" }),
		);
		expect(blank).toBe("token");
		const unknown = await checkCredential(database, {
			token: "missing-token",
			ip: "cred-unknown",
		});
		expect(unknown).toEqual({
			subject: "unknown",
			authentic: false,
			revoked: false,
		});

		await signAwardedBadge(database, {
			verificationId: first.verificationId,
			ip: "cred-sign",
		});
		const [signed] = await database
			.select({ token: badgeCredentials.token })
			.from(badgeCredentials)
			.where(eq(badgeCredentials.earnedBadgeId, first.earnedBadgeId))
			.limit(1);
		if (!signed) throw new Error("the credential was not stored");
		const held = await checkCredential(database, {
			token: signed.token,
			ip: "cred-badge",
		});
		expect(held).toEqual({
			subject: "badge",
			authentic: true,
			revoked: false,
		});

		await database.insert(earnedBadges).values({
			userId: learner.userId,
			badgeId: first.badgeId,
			enrollmentId: first.enrollmentId,
			verificationId: first.verificationId,
			entry: "revoked",
		});
		const taken = await checkCredential(database, {
			token: signed.token,
			ip: "cred-badge",
		});
		expect(taken).toEqual({
			subject: "badge",
			authentic: true,
			revoked: true,
		});

		const forged = randomBytes(32).toString("base64url");
		await database.insert(badgeCredentials).values({
			earnedBadgeId: second.earnedBadgeId,
			issuer: "Ikiraro",
			verifierUserId: trainer.userId,
			awardedAt: new Date(),
			contentHash: "a".repeat(64),
			signature: "b".repeat(64),
			token: forged,
		});
		const fake = await checkCredential(database, {
			token: forged,
			ip: "cred-forged",
		});
		expect(fake).toEqual({
			subject: "badge",
			authentic: false,
			revoked: false,
		});

		const share = randomBytes(32).toString("base64url");
		await database
			.update(users)
			.set({ dateOfBirth: "1990-01-01" })
			.where(eq(users.id, learner.userId));
		await recordConsent(database, {
			userId: learner.userId,
			purpose: "public_passport",
			granted: true,
			ip: "cred-consent",
		});
		await database
			.update(digitalPassports)
			.set({ publicShareToken: share })
			.where(eq(digitalPassports.userId, learner.userId));
		const passport = await checkCredential(database, {
			token: share,
			ip: "cred-passport",
		});
		expect(passport).toEqual({
			subject: "passport",
			authentic: false,
			revoked: true,
		});

		let blocked = false;
		try {
			await database
				.update(badgeCredentials)
				.set({ issuer: "Changed" })
				.where(eq(badgeCredentials.earnedBadgeId, first.earnedBadgeId));
		} catch (error) {
			blocked = errorText(error).includes("append-only");
		}
		expect(blocked).toBe(true);

		for (let count = 0; count < 30; count += 1) {
			await checkCredential(database, {
				token: "again",
				ip: "cred-limit",
			});
		}
		let limited = false;
		try {
			await checkCredential(database, {
				token: "again",
				ip: "cred-limit",
			});
		} catch (error) {
			limited = isApiError(error) && error.status === 429;
		}
		expect(limited).toBe(true);
	}, 120_000);
});
