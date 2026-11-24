import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import {
	badges,
	centerStaff,
	contentVersions,
	courses,
	digitalPassports,
	districts,
	earnedBadges,
	enrollments,
	learningCenters,
	modules,
	opportunities,
	provinces,
	referrals,
	roles,
	sectors,
	submissionVerifications,
	taskSubmissions,
	tasks,
	userRoles,
	users,
} from "../../db/schema";
import { isApiError } from "../api/error";
import { previewAssignment } from "../authz/preview";
import { recordConsent } from "../identity/consent";
import { createUserWithPassport } from "../identity/create-user";
import { readPassport, shownReferrals } from "../learning/passport";
import { readPublicPassport } from "../learning/share";
import { applyToMentor, approveMentor } from "./mentors";
import {
	allowReferral,
	listOpportunities,
	postOpportunity,
	recommendLearner,
} from "./opportunities";

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

describe.serial("opportunities and referrals", () => {
	test("a badge matches a partner post, and a referral stays off the passport until the learner allows it", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const skill = "Can repair a phone.";
		const admin = await createUserWithPassport(db, {
			email: `board-admin-${stamp}@demo.ikiraro.test`,
			name: "Board admin",
		});
		const partner = await createUserWithPassport(db, {
			email: `board-partner-${stamp}@demo.ikiraro.test`,
			name: "Board partner",
		});
		const mentor = await createUserWithPassport(db, {
			email: `board-mentor-${stamp}@demo.ikiraro.test`,
			name: "Board mentor",
		});
		const learner = await createUserWithPassport(db, {
			email: `board-learner-${stamp}@demo.ikiraro.test`,
			name: "Board learner",
		});
		const trainer = await createUserWithPassport(db, {
			email: `board-trainer-${stamp}@demo.ikiraro.test`,
			name: "Board trainer",
		});
		const outsider = await createUserWithPassport(db, {
			email: `board-outsider-${stamp}@demo.ikiraro.test`,
			name: "Outside trainer",
		});
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
		const partnerApplication = await applyToMentor(db, {
			userId: partner.userId,
			kind: "partner",
			weeklyContactCap: 0,
		});
		await approveMentor(db, {
			actorId: admin.userId,
			mentorId: partnerApplication.id,
		});
		const mentorApplication = await applyToMentor(db, {
			userId: mentor.userId,
			kind: "mentor",
			weeklyContactCap: 1,
		});
		await approveMentor(db, {
			actorId: admin.userId,
			mentorId: mentorApplication.id,
		});
		expect(
			await reasonOf(() =>
				postOpportunity(db, {
					userId: mentor.userId,
					kind: "job",
					title: "Phone repair",
					skill,
					body: "Repair phones at the shop.",
				}),
			),
		).toBe("approval");
		expect(
			await reasonOf(() =>
				postOpportunity(db, {
					userId: partner.userId,
					kind: "",
					title: "Phone repair",
					skill,
					body: "Repair phones at the shop.",
				}),
			),
		).toBe("kind");
		const posted = await postOpportunity(db, {
			userId: partner.userId,
			kind: "job",
			title: "Phone repair",
			skill,
			body: "Repair phones at the shop.",
		});
		await postOpportunity(db, {
			userId: partner.userId,
			kind: "training",
			title: "Cooking course",
			skill: "Cooking",
			body: "Learn to cook for a shop.",
		});
		const before = await listOpportunities(db, learner.userId);
		expect(before.matches).toEqual([]);

		const [province] = await db
			.insert(provinces)
			.values({ code: `op-${stamp}`, name: `Board province ${stamp}` })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `od-${stamp}`,
				name: `Board district ${stamp}`,
			})
			.returning({ id: districts.id });
		const [sector] = await db
			.insert(sectors)
			.values({
				districtId: district?.id ?? "",
				code: `os-${stamp}`,
				name: `Board sector ${stamp}`,
			})
			.returning({ id: sectors.id });
		const [center] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Board center ${stamp}` })
			.returning({ id: learningCenters.id });
		const [otherCenter] = await db
			.insert(learningCenters)
			.values({ sectorId: sector?.id ?? "", name: `Other center ${stamp}` })
			.returning({ id: learningCenters.id });
		if (!center || !otherCenter) throw new Error("the center was not stored");
		await db
			.update(users)
			.set({ centerId: center.id, dateOfBirth: "1991-06-02" })
			.where(eq(users.id, learner.userId));
		await db.insert(centerStaff).values([
			{ centerId: center.id, userId: trainer.userId, role: "trainer" },
			{ centerId: otherCenter.id, userId: outsider.userId, role: "trainer" },
		]);
		const [course] = await db
			.insert(courses)
			.values({ createdByUserId: trainer.userId })
			.returning({ id: courses.id });
		if (!course) throw new Error("the course was not stored");
		const [module] = await db
			.insert(modules)
			.values({ courseId: course.id })
			.returning({ id: modules.id });
		const [task] = await db
			.insert(tasks)
			.values({ moduleId: module?.id ?? "" })
			.returning({ id: tasks.id });
		const [badge] = await db
			.insert(badges)
			.values({
				courseId: course.id,
				titleEn: "Repair",
				skillEn: skill,
				level: 1,
			})
			.returning({ id: badges.id });
		const [version] = await db
			.insert(contentVersions)
			.values({
				courseId: course.id,
				versionNumber: 1,
				snapshot: {},
				publishedByUserId: trainer.userId,
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
		if (!task || !badge || !version || !enrollment) {
			throw new Error("the badge was not stored");
		}
		const submissionId = crypto.randomUUID();
		await db.insert(taskSubmissions).values({
			id: submissionId,
			enrollmentId: enrollment.id,
			taskId: task.id,
			contentVersionId: version.id,
			ownerUserId: learner.userId,
			attempt: 1,
			status: "approved",
			evidenceType: "note",
		});
		const [verification] = await db
			.insert(submissionVerifications)
			.values({
				submissionId,
				reviewerUserId: trainer.userId,
				decision: "approved",
				note: "Seen at the center.",
			})
			.returning({ id: submissionVerifications.id });
		if (!verification) throw new Error("the verification was not stored");
		await db.insert(earnedBadges).values({
			userId: learner.userId,
			badgeId: badge.id,
			enrollmentId: enrollment.id,
			verificationId: verification.id,
			entry: "awarded",
		});
		const matched = await listOpportunities(db, learner.userId);
		expect(matched.matches.map((row) => row.skill)).toEqual([skill]);
		expect(matched.matches[0]?.partnerName).toBe("Board partner");
		expect("email" in (matched.matches[0] ?? {})).toBe(false);
		try {
			await db
				.update(opportunities)
				.set({ title: "Changed" })
				.where(eq(opportunities.id, posted.id));
			throw new Error("the post was edited");
		} catch (error) {
			expect(errorText(error).includes("append-only")).toBe(true);
		}

		expect(
			await reasonOf(() =>
				recommendLearner(db, {
					actorId: outsider.userId,
					learnerId: learner.userId,
					note: "I have seen this learner repair phones.",
				}),
			),
		).toBe("scope");
		const written = await recommendLearner(db, {
			actorId: trainer.userId,
			learnerId: learner.userId,
			note: "I have seen this learner repair phones.",
		});
		expect((await readPassport(db, learner.userId)).referrals).toEqual([]);
		await allowReferral(db, { userId: learner.userId, referralId: written.id });
		const passport = await readPassport(db, learner.userId);
		expect(passport.referrals.map((row) => row.authorName)).toEqual([
			"Board trainer",
		]);
		expect(passport.referrals[0]?.note).toBe(
			"I have seen this learner repair phones.",
		);
		expect(
			await reasonOf(() =>
				allowReferral(db, { userId: learner.userId, referralId: written.id }),
			),
		).toBe("closed");
		try {
			await db
				.update(referrals)
				.set({ note: "A different sentence." })
				.where(eq(referrals.id, written.id));
			throw new Error("the referral was edited");
		} catch (error) {
			expect(errorText(error).includes("append-only")).toBe(true);
		}
		await recordConsent(db, {
			userId: learner.userId,
			purpose: "public_passport",
			granted: true,
		});
			const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
		await db
			.update(digitalPassports)
			.set({ publicShareToken: token })
			.where(eq(digitalPassports.userId, learner.userId));
		const shared = await readPublicPassport(db, token);
		expect(shared.referrals.map((row) => row.note)).toEqual([
			"I have seen this learner repair phones.",
		]);
		expect(await shownReferrals(db, learner.userId)).toHaveLength(1);
	}, 120_000);
});
