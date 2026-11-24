import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	badges,
	centerStaff,
	contentVersions,
	courses,
	districts,
	earnedBadges,
	enrollments,
	hardwareInventory,
	learningCenters,
	modules,
	provinces,
	roles,
	sectors,
	showcasePins,
	submissionVerifications,
	taskSubmissions,
	tasks,
	taskTranslations,
	userRoles,
	webhookDeliveries,
} from "../../db/schema";
import { isApiError } from "../api/error";
import type { Assignment } from "../authz/decide";
import {
	readItemCare,
	recordRepair,
	recordWarranty,
} from "../hardware/repairs";
import { insertUserWithPassport } from "../identity/create-user";
import { decideBulk } from "../learning/bulk";
import { pinShowcase, readShowcase } from "../learning/showcase";
import { writeTranscript } from "../learning/transcripts";
import {
	createPartnerWebhook,
	notifyPartners,
	partnerPayload,
} from "../partners/webhooks";
import { createMemoryObjectStore } from "../storage/object-store";
import { answerPulse, readPulse } from "../support/pulse";

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

async function statusOf(run: () => Promise<unknown>): Promise<number> {
	try {
		await run();
		return 0;
	} catch (error) {
		return isApiError(error) ? error.status : 0;
	}
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe.serial(
	"voice, bulk review, showcase, care, pulse, and webhooks",
	() => {
		test("each decision is written on its own, and a blank stays blank", async () => {
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

			async function exercise(db: Parameters<typeof decideBulk>[0]) {
				const stamp = randomUUID().slice(0, 8);
				const learner = await insertUserWithPassport(db, {
					email: `could-learner-${stamp}@example.test`,
					name: "Learner",
				});
				const trainer = await insertUserWithPassport(db, {
					email: `could-trainer-${stamp}@example.test`,
					name: "Trainer",
				});
				const [trainerRole] = await db
					.select({ id: roles.id })
					.from(roles)
					.where(eq(roles.code, "trainer"))
					.limit(1);
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
				const [course] = await db
					.insert(courses)
					.values({ status: "published", createdByUserId: learner.userId })
					.returning({ id: courses.id });
				const [module] = await db
					.insert(modules)
					.values({
						courseId: course?.id ?? "",
						position: 0,
						status: "published",
					})
					.returning({ id: modules.id });
				if (!trainerRole || !center || !course || !module) {
					throw new Error("fixture was not stored");
				}
				await db.insert(userRoles).values({
					userId: trainer.userId,
					roleId: trainerRole.id,
					scopeType: "center",
					scopeId: center.id,
				});
				await db.insert(centerStaff).values({
					centerId: center.id,
					userId: trainer.userId,
					role: "trainer",
				});
				const [version] = await db
					.insert(contentVersions)
					.values({
						courseId: course.id,
						versionNumber: 1,
						snapshot: {},
						publishedByUserId: learner.userId,
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
				if (!version || !enrollment) throw new Error("fixture was not stored");

				async function addTask(
					position: number,
					evidenceType: "note" | "voice",
				): Promise<string> {
					const [task] = await db
						.insert(tasks)
						.values({
							moduleId: module?.id ?? "",
							position,
							status: "published",
							evidenceType,
						})
						.returning({ id: tasks.id });
					if (!task) throw new Error("fixture was not stored");
					await db.insert(taskTranslations).values({
						taskId: task.id,
						locale: "en",
						title: "Ledger",
					});
					return task.id;
				}

				async function addSubmission(
					taskId: string,
					status: "pending" | "approved",
					evidenceType: "note" | "voice",
				): Promise<string> {
					const id = randomUUID();
					await db.insert(taskSubmissions).values({
						id,
						enrollmentId: enrollment?.id ?? "",
						taskId,
						contentVersionId: version?.id ?? "",
						ownerUserId: learner.userId,
						attempt: 1,
						status,
						evidenceType,
						submittedAt: new Date(),
					});
					return id;
				}

				const voiceTask = await addTask(0, "voice");
				const voiceId = await addSubmission(voiceTask, "pending", "voice");
				expect(
					await messageOf(() =>
						writeTranscript(db, {
							reviewerId: trainer.userId,
							submissionId: voiceId,
							body: "   ",
							ip: "127.0.0.1",
						}),
					),
				).toBe("Write the transcript.");
				const transcript = await writeTranscript(db, {
					reviewerId: trainer.userId,
					submissionId: voiceId,
					body: "The learner named the page.",
					ip: "127.0.0.1",
				});
				expect(transcript.id).toBeTruthy();
				expect(
					await statusOf(() =>
						writeTranscript(db, {
							reviewerId: trainer.userId,
							submissionId: voiceId,
							body: "Again.",
							ip: "127.0.0.1",
						}),
					),
				).toBe(409);

				const noteTask = await addTask(1, "note");
				const noteId = await addSubmission(noteTask, "pending", "note");
				expect(
					await messageOf(() =>
						writeTranscript(db, {
							reviewerId: trainer.userId,
							submissionId: noteId,
							body: "Not a voice note.",
							ip: "127.0.0.1",
						}),
					),
				).toBe("This work is not a voice note.");

				const approved: string[] = [];
				for (let position = 2; position < 6; position += 1) {
					const taskId = await addTask(position, "note");
					approved.push(await addSubmission(taskId, "approved", "note"));
				}
				const firstApproved = approved[0];
				const secondApproved = approved[1];
				const thirdApproved = approved[2];
				const fourthApproved = approved[3];
				if (
					!firstApproved ||
					!secondApproved ||
					!thirdApproved ||
					!fourthApproved
				) {
					throw new Error("fixture was not stored");
				}
				const store = createMemoryObjectStore({
					apiUrl: "http://localhost:3000",
					secret: "test-secret",
				});
				await pinShowcase(db, {
					userId: learner.userId,
					submissionId: firstApproved,
					ip: "127.0.0.1",
				});
				await pinShowcase(db, {
					userId: learner.userId,
					submissionId: secondApproved,
					ip: "127.0.0.1",
				});
				await pinShowcase(db, {
					userId: learner.userId,
					submissionId: thirdApproved,
					ip: "127.0.0.1",
				});
				expect(
					await messageOf(() =>
						pinShowcase(db, {
							userId: learner.userId,
							submissionId: fourthApproved,
							ip: "127.0.0.1",
						}),
					),
				).toBe("Three pieces are already on the showcase.");
				expect(
					await statusOf(() =>
						pinShowcase(db, {
							userId: learner.userId,
							submissionId: noteId,
							ip: "127.0.0.1",
						}),
					),
				).toBe(404);
				const gallery = await readShowcase(db, store, learner.userId);
				expect(gallery.pins).toHaveLength(3);
				const card = gallery.pins[0];
				expect(card?.titleEn).toBe("Ledger");
				expect(card?.evidenceUrl).toBeNull();
				expect(card && "note" in card).toBe(false);
				const pins = await db
					.select({ id: showcasePins.id })
					.from(showcasePins)
					.where(eq(showcasePins.userId, learner.userId));
				expect(pins).toHaveLength(3);

				expect(
					await messageOf(() =>
						decideBulk(db, {
							reviewerId: trainer.userId,
							submissionIds: [],
							decision: "rejected",
							note: "Spam.",
							reasonCode: "not_the_task",
							ip: "127.0.0.1",
						}),
					),
				).toBe("Choose the work.");
				expect(
					await messageOf(() =>
						decideBulk(db, {
							reviewerId: trainer.userId,
							submissionIds: [noteId, noteId],
							decision: "rejected",
							note: "Spam.",
							reasonCode: "not_the_task",
							ip: "127.0.0.1",
						}),
					),
				).toBe("Choose each piece once.");
				const waitingTask = await addTask(6, "note");
				const waiting = await addSubmission(waitingTask, "pending", "note");
				const otherTask = await addTask(7, "note");
				const other = await addSubmission(otherTask, "pending", "note");
				expect(
					await statusOf(() =>
						decideBulk(db, {
							reviewerId: learner.userId,
							submissionIds: [waiting, other],
							decision: "rejected",
							note: "Spam.",
							reasonCode: "not_the_task",
							ip: "127.0.0.1",
						}),
					),
				).toBe(404);
				const decided = await decideBulk(db, {
					reviewerId: trainer.userId,
					submissionIds: [waiting, other],
					decision: "rejected",
					note: "This is not the task.",
					reasonCode: "not_the_task",
					ip: "127.0.0.1",
				});
				expect(decided.count).toBe(2);
				const written = await db
					.select({ id: submissionVerifications.id })
					.from(submissionVerifications)
					.where(
						inArray(submissionVerifications.submissionId, [waiting, other]),
					);
				expect(written).toHaveLength(2);

				expect((await readPulse(db, learner.userId)).moment).toBe("review");
				expect(
					await messageOf(() =>
						answerPulse(db, {
							userId: learner.userId,
							moment: "review",
							verificationId: written[0]?.id ?? "",
							body: "   ",
							ip: "127.0.0.1",
						}),
					),
				).toBe("Write how it went.");
				const [badge] = await db
					.insert(badges)
					.values({ courseId: course.id, titleEn: "Ledger", level: 1 })
					.returning({ id: badges.id });
				const verification = written[0];
				if (!badge || !verification) throw new Error("fixture was not stored");
				await db.insert(earnedBadges).values({
					userId: learner.userId,
					badgeId: badge.id,
					enrollmentId: enrollment.id,
					verificationId: verification.id,
					entry: "awarded",
				});
				expect((await readPulse(db, learner.userId)).moment).toBe(
					"first_badge",
				);
				await answerPulse(db, {
					userId: learner.userId,
					moment: "first_badge",
					body: "The first badge helped.",
					ip: "127.0.0.1",
				});
				for (let step = 0; step < 4; step += 1) {
					const open = await readPulse(db, learner.userId);
					if (open.moment !== "review" || !open.verificationId) break;
					await answerPulse(db, {
						userId: learner.userId,
						moment: "review",
						verificationId: open.verificationId,
						body: "The review was clear.",
						ip: "127.0.0.1",
					});
				}
				expect((await readPulse(db, learner.userId)).moment).toBeNull();
				expect(
					await messageOf(() =>
						answerPulse(db, {
							userId: learner.userId,
							moment: "review",
							body: "Again.",
							ip: "127.0.0.1",
						}),
					),
				).toBe("Nothing to answer.");

				const learnerOnly: Assignment[] = [
					{ role: "learner", scopeType: "self", scopeId: null },
				];
				const officer: Assignment[] = [
					{ role: "hardware_officer", scopeType: "global", scopeId: null },
				];
				const admin: Assignment[] = [
					{ role: "platform_admin", scopeType: "global", scopeId: null },
				];
				const [item] = await db
					.insert(hardwareInventory)
					.values({
						name: `Laptop ${stamp}`,
						category: "laptop",
						serial: `SN-${stamp}`,
						condition: "good",
						status: "in_stock",
						centerId: center.id,
						acquiredOn: "2026-01-02",
						createdByUserId: trainer.userId,
					})
					.returning({ id: hardwareInventory.id });
				if (!item) throw new Error("fixture was not stored");
				expect(
					await statusOf(() => readItemCare(db, learnerOnly, item.id)),
				).toBe(403);
				expect(
					await messageOf(() =>
						recordRepair(db, {
							actorId: trainer.userId,
							assignments: officer,
							inventoryId: item.id,
							note: "  ",
							ip: "127.0.0.1",
						}),
					),
				).toBe("Write what was repaired.");
				expect(
					await messageOf(() =>
						recordWarranty(db, {
							actorId: trainer.userId,
							assignments: officer,
							inventoryId: item.id,
							endsOn: "",
							ip: "127.0.0.1",
						}),
					),
				).toBe("Write the warranty date.");
				await recordRepair(db, {
					actorId: trainer.userId,
					assignments: officer,
					inventoryId: item.id,
					note: "Replaced the screen.",
					ip: "127.0.0.1",
				});
				await recordWarranty(db, {
					actorId: trainer.userId,
					assignments: officer,
					inventoryId: item.id,
					endsOn: "2020-01-15",
					ip: "127.0.0.1",
				});
				const care = await readItemCare(db, officer, item.id);
				expect(care.repairs[0]?.note).toBe("Replaced the screen.");
				expect(care.warrantyEndsOn).toBe("2020-01-15");

				expect(
					await statusOf(() =>
						createPartnerWebhook(db, {
							actorId: learner.userId,
							assignments: learnerOnly,
							url: "https://partner.example.test/hooks",
							event: "credential.awarded",
							ip: "127.0.0.1",
						}),
					),
				).toBe(403);
				expect(
					await messageOf(() =>
						createPartnerWebhook(db, {
							actorId: trainer.userId,
							assignments: admin,
							url: "http://partner.example.test/hooks",
							event: "credential.awarded",
							ip: "127.0.0.1",
						}),
					),
				).toBe("Write the partner address.");
				expect(
					await messageOf(() =>
						createPartnerWebhook(db, {
							actorId: trainer.userId,
							assignments: admin,
							url: "https://partner.example.test/hooks",
							event: "other",
							ip: "127.0.0.1",
						}),
					),
				).toBe("Choose what to send.");
				const stored = await createPartnerWebhook(db, {
					actorId: trainer.userId,
					assignments: admin,
					url: "https://partner.example.test/hooks",
					event: "credential.awarded",
					ip: "127.0.0.1",
				});
				const target = randomUUID();
				expect(
					partnerPayload({ event: "credential.awarded", targetId: target }),
				).toEqual({ event: "credential.awarded", targetId: target });
				await notifyPartners(db, {
					event: "credential.awarded",
					targetId: target,
				});
				const [delivery] = await db
					.select({
						event: webhookDeliveries.event,
						targetId: webhookDeliveries.targetId,
					})
					.from(webhookDeliveries)
					.where(eq(webhookDeliveries.webhookId, stored.id));
				expect(delivery).toEqual({
					event: "credential.awarded",
					targetId: target,
				});
				expect(JSON.stringify(delivery)).not.toContain("@");
			}
		}, 120_000);
	},
);
