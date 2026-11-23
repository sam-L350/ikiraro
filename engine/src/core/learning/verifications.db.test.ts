import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestEnv } from "../../../test/helpers";
import * as schema from "../../db/schema";
import {
	centerStaff,
	contentVersions,
	courses,
	declaredRelationships,
	districts,
	domainEvents,
	enrollments,
	learningCenters,
	modules,
	provinces,
	roles,
	rubricCriteria,
	sectors,
	submissionVerifications,
	tasks,
	userRoles,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { insertUserWithPassport } from "../identity/create-user";
import { createSubmission, listSubmissions } from "./submissions";
import { createVerification } from "./verifications";

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
	if (error instanceof Error)
		return `${error.message} ${errorText(error.cause)}`;
	return "";
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe("verification decisions", () => {
	test("a send-back is stored once, and a relative or the learner cannot be reviewed", async () => {
		useTestEnv();
		if (!suite) return;
		const database = suite.db;
		const suffix = crypto.randomUUID().slice(0, 8);
		const learner = await insertUserWithPassport(database, {
			email: `decide-learner-${suffix}@example.test`,
			name: "Learner",
		});
		const relative = await insertUserWithPassport(database, {
			email: `decide-relative-${suffix}@example.test`,
			name: "Relative",
		});
		const trainer = await insertUserWithPassport(database, {
			email: `decide-trainer-${suffix}@example.test`,
			name: "Trainer",
		});
		const [province] = await database
			.insert(provinces)
			.values({ code: `p-${suffix}`, name: "Province" })
			.returning({ id: provinces.id });
		const [district] = await database
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `d-${suffix}`,
				name: "District",
			})
			.returning({ id: districts.id });
		const [sector] = await database
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `s-${suffix}`,
				name: "Sector",
			})
			.returning({ id: sectors.id });
		const [center] = await database
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Center ${suffix}` })
			.returning({ id: learningCenters.id });
		const [otherCenter] = await database
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Other ${suffix}` })
			.returning({ id: learningCenters.id });
		const [course] = await database
			.insert(courses)
			.values({ status: "published", createdByUserId: learner.userId })
			.returning({ id: courses.id });
		const [module] = await database
			.insert(modules)
			.values({ courseId: course?.id ?? "", position: 0, status: "published" })
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
		const [otherTask] = await database
			.insert(tasks)
			.values({
				moduleId: module?.id ?? "",
				position: 1,
				status: "published",
				evidenceType: "note",
			})
			.returning({ id: tasks.id });
		if (!course || !module || !task || !otherTask || !center || !otherCenter) {
			throw new Error("fixture was not stored");
		}
		const [criterion] = await database
			.insert(rubricCriteria)
			.values({
				taskId: task.id,
				position: 0,
				weight: 1,
				promptEn: "The note names the page.",
				promptRw: "",
			})
			.returning({ id: rubricCriteria.id });
		if (!criterion) throw new Error("rubric was not stored");
		const snapshot = {
			titleEn: "Ledger",
			titleRw: "",
			modules: [
				{
					id: module.id,
					position: 0,
					titleEn: "Module",
					titleRw: "",
					requires: [],
					tasks: [
						{
							id: task.id,
							position: 0,
							required: true,
							titleEn: "Note",
							titleRw: "",
							instructionsEn: "",
							instructionsRw: "",
							evidenceType: "note",
							criteria: [],
						},
						{
							id: otherTask.id,
							position: 1,
							required: true,
							titleEn: "Other",
							titleRw: "",
							instructionsEn: "",
							instructionsRw: "",
							evidenceType: "note",
							criteria: [],
						},
					],
				},
			],
		};
		const [version] = await database
			.insert(contentVersions)
			.values({
				courseId: course.id,
				versionNumber: 1,
				snapshot,
				publishedByUserId: learner.userId,
			})
			.returning({ id: contentVersions.id });
		if (!version) throw new Error("version was not stored");
		const courseId = course.id;
		const versionId = version.id;
		async function enroll(userId: number, centerId: string) {
			const [row] = await database
				.insert(enrollments)
				.values({
					userId,
					courseId,
					contentVersionId: versionId,
					centerId,
				})
				.returning({ id: enrollments.id });
			if (!row) throw new Error("enrollment was not stored");
			return row.id;
		}
		const learnerEnrollment = await enroll(learner.userId, center.id);
		const relativeEnrollment = await enroll(relative.userId, center.id);
		const trainerEnrollment = await enroll(trainer.userId, center.id);
		const outsideEnrollment = await enroll(
			(
				await insertUserWithPassport(database, {
					email: `decide-out-${suffix}@example.test`,
				})
			).userId,
			otherCenter.id,
		);
		const waiting = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: learnerEnrollment,
			taskId: task.id,
			ownerUserId: learner.userId,
			note: "The page.",
			submit: true,
			ip: "127.0.0.1",
		});
		const rejection = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: learnerEnrollment,
			taskId: otherTask.id,
			ownerUserId: learner.userId,
			note: "The other page.",
			submit: true,
			ip: "127.0.0.1",
		});
		const own = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: trainerEnrollment,
			taskId: task.id,
			ownerUserId: trainer.userId,
			note: "My own page.",
			submit: true,
			ip: "127.0.0.1",
		});
		const family = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: relativeEnrollment,
			taskId: task.id,
			ownerUserId: relative.userId,
			note: "A relative's page.",
			submit: true,
			ip: "127.0.0.1",
		});
		const hidden = await createSubmission(database, {
			id: crypto.randomUUID(),
			enrollmentId: outsideEnrollment,
			taskId: task.id,
			ownerUserId:
				(
					await database
						.select({ userId: enrollments.userId })
						.from(enrollments)
						.where(eq(enrollments.id, outsideEnrollment))
						.limit(1)
				)[0]?.userId ?? 0,
			note: "Another center.",
			submit: true,
			ip: "127.0.0.1",
		});
		const [role] = await database
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.code, "trainer"))
			.limit(1);
		if (!role) throw new Error("trainer role is missing");
		await database.insert(userRoles).values({
			userId: trainer.userId,
			roleId: role.id,
			scopeType: "center",
			scopeId: center.id,
		});
		await database.insert(centerStaff).values({
			centerId: center.id,
			userId: trainer.userId,
			role: "trainer",
		});
		await database.insert(declaredRelationships).values({
			userId: relative.userId,
			relatedUserId: trainer.userId,
			kind: "relative",
		});

		const decided = await createVerification(database, {
			reviewerId: trainer.userId,
			submissionId: waiting.id,
			decision: "needs_revision",
			note: "Name the page.",
			scores: [{ criterionId: criterion.id, score: 40 }],
			ip: "127.0.0.1",
		});
		expect(decided.decision).toBe("needs_revision");
		expect(decided.scoreTotal).toBe(40);
		const history = await listSubmissions(database, {
			enrollmentId: learnerEnrollment,
			ownerUserId: learner.userId,
		});
		expect(history.find((item) => item.id === waiting.id)?.feedback).toBe(
			"Name the page.",
		);
		expect(history.find((item) => item.id === waiting.id)?.status).toBe(
			"needs_revision",
		);
		const [event] = await database
			.select({ name: domainEvents.name })
			.from(domainEvents)
			.where(sql`${domainEvents.payload}->>'verificationId' = ${decided.id}`)
			.limit(1);
		expect(event?.name).toBe("submission.needs_revision");

		try {
			await createVerification(database, {
				reviewerId: trainer.userId,
				submissionId: waiting.id,
				decision: "rejected",
				note: "Again.",
				reasonCode: "unreadable",
				scores: [{ criterionId: criterion.id, score: 0 }],
				ip: "127.0.0.1",
			});
			throw new Error("expected a second decision to be refused");
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(409);
		}

		let thrown: unknown;
		try {
			await database.execute(
				sql`update submission_verifications set note = 'changed' where id = ${decided.id}`,
			);
		} catch (error) {
			thrown = error;
		}
		expect(errorText(thrown)).toContain("append-only");
		const [stored] = await database
			.select({ note: submissionVerifications.note })
			.from(submissionVerifications)
			.where(eq(submissionVerifications.id, decided.id))
			.limit(1);
		expect(stored?.note).toBe("Name the page.");

		try {
			await createVerification(database, {
				reviewerId: trainer.userId,
				submissionId: own.id,
				decision: "needs_revision",
				note: "Mine.",
				scores: [{ criterionId: criterion.id, score: 10 }],
				ip: "127.0.0.1",
			});
			throw new Error("expected the trainer's own work to be blocked");
		} catch (error) {
			expect(isApiError(error) && error.details).toEqual({ reason: "self" });
		}
		try {
			await createVerification(database, {
				reviewerId: trainer.userId,
				submissionId: family.id,
				decision: "needs_revision",
				note: "Family.",
				scores: [{ criterionId: criterion.id, score: 10 }],
				ip: "127.0.0.1",
			});
			throw new Error("expected a declared relative to be blocked");
		} catch (error) {
			expect(isApiError(error) && error.details).toEqual({
				reason: "relative",
			});
		}
		try {
			await createVerification(database, {
				reviewerId: trainer.userId,
				submissionId: hidden.id,
				decision: "needs_revision",
				note: "Hidden.",
				scores: [{ criterionId: criterion.id, score: 10 }],
				ip: "127.0.0.1",
			});
			throw new Error("expected another center to stay hidden");
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(404);
		}

		try {
			await createVerification(database, {
				reviewerId: trainer.userId,
				submissionId: rejection.id,
				decision: "rejected",
				note: "No reason.",
				ip: "127.0.0.1",
			});
			throw new Error("expected a rejection to need a reason");
		} catch (error) {
			expect(isApiError(error) && error.details).toEqual({ reason: "reason" });
		}
		const rejected = await createVerification(database, {
			reviewerId: trainer.userId,
			submissionId: rejection.id,
			decision: "rejected",
			reasonCode: "not_the_task",
			note: "This is a different page.",
			ip: "127.0.0.1",
		});
		expect(rejected.decision).toBe("rejected");
		expect(rejected.scoreTotal).toBeNull();
	}, 90_000);
});
