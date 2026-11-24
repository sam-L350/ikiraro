import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	accountMerges,
	contentVersions,
	courses,
	districts,
	enrollments,
	learningCenters,
	mediaObjects,
	modules,
	provinces,
	sectors,
	submissionVerifications,
	systemAuditLogs,
	taskSubmissions,
	tasks,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { confirmFactor, readFactor, startFactor } from "../auth/factors";
import { login, readOwnLock, resetLoginGuards } from "../auth/login";
import { hashPassword } from "../auth/password";
import { totpCode } from "../auth/totp";
import type { Assignment } from "../authz/decide";
import { insertUserWithPassport } from "../identity/create-user";
import {
	decideMerge,
	proposeMerge,
	readDuplicates,
} from "../identity/duplicates";
import { TOMBSTONE_NAME } from "../identity/privacy";
import {
	dropExpiredImages,
	readRetention,
	writeRetention,
} from "../identity/retention";
import { createMemoryObjectStore } from "../storage/object-store";

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

async function messageOf(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
		return "";
	} catch (error) {
		return isApiError(error) ? error.message : "unexpected";
	}
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe.serial("duplicate merge, second code, retention, and lockout", () => {
	test("a second admin closes the duplicate, and a blank period stays blank", async () => {
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

		async function exercise(db: Parameters<typeof proposeMerge>[0]) {
			const stamp = randomUUID().slice(0, 8);
			const adminUser = await insertUserWithPassport(db, {
				email: `accounts-admin-${stamp}@example.test`,
				name: "Admin",
			});
			const otherAdmin = await insertUserWithPassport(db, {
				email: `accounts-other-${stamp}@example.test`,
				name: "Other",
			});
			const staff = await insertUserWithPassport(db, {
				email: `accounts-staff-${stamp}@example.test`,
				name: "Staff",
			});
			const first = await insertUserWithPassport(db, {
				email: `accounts-first-${stamp}@example.test`,
				name: "Aline Keza",
			});
			const second = await insertUserWithPassport(db, {
				email: `accounts-second-${stamp}@example.test`,
				name: "aline  keza",
			});
			const other = await insertUserWithPassport(db, {
				email: `accounts-other-person-${stamp}@example.test`,
				name: "Aline Keza",
			});
			const [province] = await db
				.insert(provinces)
				.values({ code: `p-${stamp}`, name: "Province" })
				.returning({ id: provinces.id });
			const [district] = await db
				.insert(districts)
				.values({
					provinceId: province?.id ?? "",
					code: `d-${stamp}`,
					name: "District",
				})
				.returning({ id: districts.id });
			const [sector] = await db
				.insert(sectors)
				.values({
					districtId: district?.id ?? "",
					code: `s-${stamp}`,
					name: "Sector",
				})
				.returning({ id: sectors.id });
			const [center] = await db
				.insert(learningCenters)
				.values({ sectorId: sector?.id ?? "", name: `Center ${stamp}` })
				.returning({ id: learningCenters.id });
			if (!center) throw new Error("fixture was not stored");
			await db
				.update(users)
				.set({
					name: "Aline Keza",
					dateOfBirth: "2001-02-03",
					centerId: center.id,
				})
				.where(eq(users.id, first.userId));
			await db
				.update(users)
				.set({
					name: "aline  keza",
					dateOfBirth: "2001-02-03",
					centerId: center.id,
				})
				.where(eq(users.id, second.userId));
			await db
				.update(users)
				.set({
					name: "Aline Keza",
					dateOfBirth: "1990-01-01",
					centerId: center.id,
				})
				.where(eq(users.id, other.userId));

			const admin: Assignment = {
				role: "platform_admin",
				scopeType: "global",
				scopeId: null,
			};
			const learner: Assignment = {
				role: "learner",
				scopeType: "self",
				scopeId: String(first.userId),
			};
			const trainer: Assignment = {
				role: "trainer",
				scopeType: "center",
				scopeId: center.id,
			};
			const found = await readDuplicates(db, {
				actorId: adminUser.userId,
				assignments: [admin],
			});
			const ours = found.pairs.filter(
				(pair) =>
					pair.first.id === first.userId || pair.second.id === first.userId,
			);
			expect(ours).toHaveLength(1);
			expect(ours[0]?.reason).toBe("identity");
			expect(
				await messageOf(() =>
					readDuplicates(db, {
						actorId: first.userId,
						assignments: [learner],
					}),
				),
			).toBe("An administrator reviews possible duplicates.");
			expect(
				await messageOf(() =>
					proposeMerge(db, {
						actorId: adminUser.userId,
						assignments: [admin],
						keepUserId: first.userId,
						dropUserId: second.userId,
						reason: "   ",
						ip: "127.0.0.1",
					}),
				),
			).toBe("Write why these are the same person.");
			expect(
				await messageOf(() =>
					proposeMerge(db, {
						actorId: adminUser.userId,
						assignments: [admin],
						keepUserId: 0,
						dropUserId: second.userId,
						reason: "Same person",
						ip: "127.0.0.1",
					}),
				),
			).toBe("That person was not found.");
			expect(
				await messageOf(() =>
					proposeMerge(db, {
						actorId: adminUser.userId,
						assignments: [admin],
						keepUserId: first.userId,
						dropUserId: other.userId,
						reason: "Not the same date",
						ip: "127.0.0.1",
					}),
				),
			).toBe("That person was not found.");
			const asked = await proposeMerge(db, {
				actorId: adminUser.userId,
				assignments: [admin],
				keepUserId: first.userId,
				dropUserId: second.userId,
				reason: `Same person ${stamp}`,
				ip: "127.0.0.1",
			});
			expect(
				await messageOf(() =>
					decideMerge(db, {
						actorId: adminUser.userId,
						assignments: [admin],
						requestId: asked.id,
						decision: "approved",
						note: "",
						ip: "127.0.0.1",
					}),
				),
			).toBe("A different administrator decides.");
			const decided = await decideMerge(db, {
				actorId: otherAdmin.userId,
				assignments: [admin],
				requestId: asked.id,
				decision: "approved",
				note: "",
				ip: "127.0.0.1",
			});
			expect(decided.status).toBe("approved");
			const [closed] = await db
				.select({ name: users.name, deletedAt: users.deletedAt })
				.from(users)
				.where(eq(users.id, second.userId))
				.limit(1);
			expect(closed?.name).toBe(TOMBSTONE_NAME);
			expect(closed?.deletedAt).toBeTruthy();
			const after = await readDuplicates(db, {
				actorId: otherAdmin.userId,
				assignments: [admin],
			});
			expect(
				after.pairs.some(
					(pair) =>
						pair.first.id === second.userId || pair.second.id === second.userId,
				),
			).toBe(false);
			const [merged] = await db
				.select({ id: accountMerges.id })
				.from(accountMerges)
				.where(eq(accountMerges.requestId, asked.id))
				.limit(1);
			expect(merged?.id).toBeTruthy();
			const [audit] = await db
				.select({ metadata: systemAuditLogs.metadata })
				.from(systemAuditLogs)
				.where(eq(systemAuditLogs.targetId, asked.id))
				.limit(1);
			expect(JSON.stringify(audit?.metadata ?? {})).not.toContain("@");

			expect(
				await messageOf(() =>
					startFactor(db, {
						userId: first.userId,
						assignments: [learner],
						ip: "127.0.0.1",
					}),
				),
			).toBe("A staff account can add a second code.");
			const started = await startFactor(db, {
				userId: staff.userId,
				assignments: [trainer],
				ip: "127.0.0.1",
			});
			expect(started.secret.length).toBeGreaterThan(15);
			expect(
				await messageOf(() =>
					confirmFactor(db, {
						userId: staff.userId,
						code: "000000",
						ip: "127.0.0.1",
					}),
				),
			).toBe("That code is not right.");
			const current = await totpCode(started.secret, Date.now());
			if (!current) throw new Error("fixture was not stored");
			const confirmed = await confirmFactor(db, {
				userId: staff.userId,
				code: current,
				ip: "127.0.0.1",
			});
			expect(confirmed).toEqual({ enabled: true });
			expect(await readFactor(db, staff.userId)).toEqual({ enabled: true });

			expect(
				await messageOf(() => readRetention(db, { assignments: [learner] })),
			).toBe("An administrator stores how long a photo stays.");
			expect(
				await messageOf(() =>
					writeRetention(db, {
						actorId: adminUser.userId,
						assignments: [admin],
						days: -1,
						ip: "127.0.0.1",
					}),
				),
			).toBe("Write how many days.");
			expect(await readRetention(db, { assignments: [admin] })).toEqual({
				days: null,
			});
			const kept = await writeRetention(db, {
				actorId: adminUser.userId,
				assignments: [admin],
				days: 0,
				ip: "127.0.0.1",
			});
			expect(kept).toEqual({ days: 0 });

			const [course] = await db
				.insert(courses)
				.values({ status: "published", createdByUserId: adminUser.userId })
				.returning({ id: courses.id });
			const [module] = await db
				.insert(modules)
				.values({
					courseId: course?.id ?? "",
					position: 0,
					status: "published",
				})
				.returning({ id: modules.id });
			const [version] = await db
				.insert(contentVersions)
				.values({
					courseId: course?.id ?? "",
					versionNumber: 1,
					snapshot: {},
					publishedByUserId: adminUser.userId,
				})
				.returning({ id: contentVersions.id });
			const [enrollment] = await db
				.insert(enrollments)
				.values({
					userId: first.userId,
					courseId: course?.id ?? "",
					contentVersionId: version?.id ?? "",
					centerId: center.id,
				})
				.returning({ id: enrollments.id });
			const [task] = await db
				.insert(tasks)
				.values({
					moduleId: module?.id ?? "",
					position: 0,
					status: "published",
					evidenceType: "photo",
				})
				.returning({ id: tasks.id });
			const objectKey = `photo-${stamp}`;
			const [media] = await db
				.insert(mediaObjects)
				.values({
					ownerUserId: first.userId,
					objectKey,
					contentType: "image/jpeg",
					declaredBytes: 8,
					sizeBytes: 8,
					status: "ready",
				})
				.returning({ id: mediaObjects.id });
			const submissionId = randomUUID();
			if (!course || !module || !version || !enrollment || !task || !media) {
				throw new Error("fixture was not stored");
			}
			await db.insert(taskSubmissions).values({
				id: submissionId,
				enrollmentId: enrollment.id,
				taskId: task.id,
				contentVersionId: version.id,
				ownerUserId: first.userId,
				attempt: 1,
				status: "approved",
				evidenceType: "photo",
				mediaObjectId: media.id,
				objectKey,
				contentHash: "abc",
				createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
				submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
			});
			await db.insert(submissionVerifications).values({
				submissionId,
				reviewerUserId: adminUser.userId,
				decision: "approved",
				note: "The photo matches the task.",
			});
			const store = createMemoryObjectStore({
				apiUrl: "http://localhost:3000",
				secret: "test-secret",
			});
			await store.put({
				key: objectKey,
				contentType: "image/jpeg",
				bytes: new Uint8Array([1, 2, 3, 4]),
			});
			expect(await dropExpiredImages(db, store)).toEqual({ dropped: 0 });
			await writeRetention(db, {
				actorId: adminUser.userId,
				assignments: [admin],
				days: 1,
				ip: "127.0.0.1",
			});
			const removed = await dropExpiredImages(db, store);
			expect(removed.dropped).toBeGreaterThan(0);
			const [photo] = await db
				.select({
					objectKey: taskSubmissions.objectKey,
					contentHash: taskSubmissions.contentHash,
				})
				.from(taskSubmissions)
				.where(eq(taskSubmissions.id, submissionId))
				.limit(1);
			expect(photo?.objectKey).toBeNull();
			expect(photo?.contentHash).toBeNull();
			const [decision] = await db
				.select({ note: submissionVerifications.note })
				.from(submissionVerifications)
				.where(eq(submissionVerifications.submissionId, submissionId))
				.limit(1);
			expect(decision?.note).toBe("The photo matches the task.");
			expect(await store.read(objectKey)).toBeNull();

			const email = `accounts-lock-${stamp}@example.test`;
			const lockedUser = await insertUserWithPassport(db, {
				email,
				name: "Locked",
			});
			await db
				.update(users)
				.set({ passwordHash: await hashPassword("account-lock-check") })
				.where(eq(users.id, lockedUser.userId));
			resetLoginGuards();
			for (let attempt = 0; attempt < 4; attempt += 1) {
				expect(
					await messageOf(() =>
						login(db, {
							method: "password",
							email,
							password: "wrong-password",
							ip: "127.0.0.1",
						}),
					),
				).toBe("The email or password is wrong.");
			}
			expect(
				await messageOf(() =>
					login(db, {
						method: "password",
						email,
						password: "wrong-password",
						ip: "127.0.0.1",
					}),
				),
			).toBe("Too many attempts. Wait and try again.");
			resetLoginGuards();
			expect(
				await messageOf(() =>
					login(db, {
						method: "password",
						email,
						password: "account-lock-check",
						ip: "127.0.0.1",
					}),
				),
			).toBe("Too many attempts. Wait and try again.");
			const lock = await readOwnLock(db, { email, phone: null });
			expect(lock.locked).toBe(true);
			expect(lock.until).toBeTruthy();
		}
	}, 120_000);
});
