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
	learningCenters,
	mediaObjects,
	provinces,
	roles,
	sectors,
	successStories,
	userRoles,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import type { Assignment } from "../authz/decide";
import { recordConsent } from "../identity/consent";
import { createUserWithPassport } from "../identity/create-user";
import {
	exportPartnerStories,
	publishStory,
	readPartnerStories,
} from "./stories";

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

function digest(): string {
	return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

const store = {
	async createDownloadUrl(input: { key: string; expiresInSeconds: number }) {
		return {
			url: `https://stories.example/${input.key}`,
			expiresAt: new Date(
				Date.now() + input.expiresInSeconds * 1000,
			).toISOString(),
		};
	},
};

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe.serial("success stories", () => {
	test("a partner report includes the story only while consent is on", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const db = suite.db;
		const stamp = Date.now().toString(36);
		const email = `story-${stamp}@demo.ikiraro.test`;
		const firstText = `First story ${stamp}`;
		const secondText = `Second story ${stamp}`;
		const learner = await createUserWithPassport(db, {
			email,
			name: `Story ${stamp}`,
		});
		const minor = await createUserWithPassport(db, {
			email: `story-minor-${stamp}@demo.ikiraro.test`,
			name: "Young story",
		});
		const admin = await createUserWithPassport(db, {
			email: `story-admin-${stamp}@demo.ikiraro.test`,
			name: "Story admin",
		});
		const home = await createUserWithPassport(db, {
			email: `story-home-${stamp}@demo.ikiraro.test`,
			name: "Home coordinator",
		});
		const away = await createUserWithPassport(db, {
			email: `story-away-${stamp}@demo.ikiraro.test`,
			name: "Away coordinator",
		});
		await db
			.update(users)
			.set({ dateOfBirth: "2014-03-01" })
			.where(eq(users.id, minor.userId));
		const [province] = await db
			.insert(provinces)
			.values({ code: `sp-${stamp}`, name: "Story province" })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `sd-${stamp}`,
				name: "Story district",
			})
			.returning({ id: districts.id });
		const [otherDistrict] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `so-${stamp}`,
				name: "Other story district",
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `ss-${stamp}`,
				name: "Story sector",
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Story center ${stamp}` })
			.returning({ id: learningCenters.id });
		if (!district || !otherDistrict || !center) {
			throw new Error("The story place was not stored.");
		}
		await db
			.update(users)
			.set({ centerId: center.id })
			.where(eq(users.id, learner.userId));
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
				userId: admin.userId,
				roleId: roleId("platform_admin"),
				scopeType: "global",
				scopeId: "global",
			},
			{
				userId: home.userId,
				roleId: roleId("district_coordinator"),
				scopeType: "district",
				scopeId: district.id,
			},
			{
				userId: away.userId,
				roleId: roleId("district_coordinator"),
				scopeType: "district",
				scopeId: otherDistrict.id,
			},
		]);
		const adminAssignment: Assignment[] = [
			{ role: "platform_admin", scopeType: "global", scopeId: "global" },
		];
		const homeAssignment: Assignment[] = [
			{
				role: "district_coordinator",
				scopeType: "district",
				scopeId: district.id,
			},
		];
		const awayAssignment: Assignment[] = [
			{
				role: "district_coordinator",
				scopeType: "district",
				scopeId: otherDistrict.id,
			},
		];
		const learnerAssignment: Assignment[] = [
			{ role: "learner", scopeType: "self", scopeId: String(learner.userId) },
		];
		const [photo] = await db
			.insert(mediaObjects)
			.values({
				ownerUserId: learner.userId,
				objectKey: `evidence/${crypto.randomUUID()}`,
				contentType: "image/jpeg",
				declaredBytes: 4,
				sizeBytes: 4,
				sha256: digest(),
				status: "ready",
				finalizedAt: new Date(),
			})
			.returning({ id: mediaObjects.id });
		const [pending] = await db
			.insert(mediaObjects)
			.values({
				ownerUserId: learner.userId,
				objectKey: `evidence/${crypto.randomUUID()}`,
				contentType: "image/jpeg",
				declaredBytes: 4,
				status: "pending",
			})
			.returning({ id: mediaObjects.id });
		if (!photo || !pending) throw new Error("The photo was not stored.");
		try {
			await publishStory(db, {
				userId: learner.userId,
				body: firstText,
				mediaId: photo.id,
				ip: "127.0.0.1",
			});
			throw new Error("expected a story without consent to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(400);
			expect(reasonOf(error)).toBe("consent");
		}
		try {
			await recordConsent(db, {
				userId: minor.userId,
				purpose: "success_story",
				granted: true,
			});
			throw new Error("expected a minor to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(400);
			expect(reasonOf(error)).toBe("minor_visibility");
		}
		await recordConsent(db, {
			userId: learner.userId,
			purpose: "success_story",
			granted: true,
		});
		try {
			await publishStory(db, {
				userId: learner.userId,
				body: " ",
				mediaId: photo.id,
				ip: "127.0.0.1",
			});
			throw new Error("expected a blank story to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(400);
			expect(reasonOf(error)).toBe("story");
		}
		try {
			await publishStory(db, {
				userId: learner.userId,
				body: firstText,
				mediaId: pending.id,
				ip: "127.0.0.1",
			});
			throw new Error("expected a photo that is not ready to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(409);
			expect(reasonOf(error)).toBe("photo");
		}
		await publishStory(db, {
			userId: learner.userId,
			body: firstText,
			mediaId: photo.id,
			ip: "127.0.0.1",
		});
		await publishStory(db, {
			userId: learner.userId,
			body: secondText,
			mediaId: photo.id,
			ip: "127.0.0.1",
		});
		const stored = await db
			.select({ id: successStories.id })
			.from(successStories)
			.where(eq(successStories.userId, learner.userId));
		expect(stored.length).toBe(2);
		const report = await readPartnerStories(db, store, adminAssignment);
		const match = report.stories.filter((item) => item.story === secondText);
		expect(match).toHaveLength(1);
		expect(match[0]?.name).toBe(`Story ${stamp}`);
		expect(
			match[0]?.photoUrl.startsWith("https://stories.example/evidence/"),
		).toBe(true);
		expect(report.stories.some((item) => item.story === firstText)).toBe(false);
		const file = await exportPartnerStories(db, store, {
			actorId: admin.userId,
			assignments: adminAssignment,
			ip: "127.0.0.1",
		});
		expect(file.file.includes(email)).toBe(false);
		expect(file.file.includes(secondText)).toBe(true);
		const homeReport = await readPartnerStories(db, store, homeAssignment);
		expect(homeReport.stories.some((item) => item.story === secondText)).toBe(
			true,
		);
		const awayReport = await readPartnerStories(db, store, awayAssignment);
		expect(awayReport.stories.some((item) => item.story === secondText)).toBe(
			false,
		);
		try {
			await readPartnerStories(db, store, learnerAssignment);
			throw new Error("expected a learner to be refused");
		} catch (error) {
			expect(statusOf(error)).toBe(403);
			expect(reasonOf(error)).toBe("scope");
		}
		await recordConsent(db, {
			userId: learner.userId,
			purpose: "success_story",
			granted: false,
		});
		const withdrawn = await readPartnerStories(db, store, adminAssignment);
		expect(withdrawn.stories.some((item) => item.story === secondText)).toBe(
			false,
		);
	}, 120_000);
});
