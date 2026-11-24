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
	mentorRequests,
	mentors,
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
	listDiscoverable,
	optInToMentors,
	requestLearner,
} from "./mentors";

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

describe.serial("mentors", () => {
	test("an admin approves the cap the person typed, and a learner opts in before a request", async () => {
		if (!suite) throw new Error("DATABASE_URL is missing");
		const { db } = suite;
		const stamp = Date.now().toString(36);
		const admin = await createUserWithPassport(db, {
			email: `mentor-admin-${stamp}@demo.ikiraro.test`,
			name: "Mentor admin",
		});
		const applicant = await createUserWithPassport(db, {
			email: `mentor-applicant-${stamp}@demo.ikiraro.test`,
			name: "Mentor applicant",
		});
		const learner = await createUserWithPassport(db, {
			email: `mentor-learner-${stamp}@demo.ikiraro.test`,
			name: "Mentor learner",
		});
		const second = await createUserWithPassport(db, {
			email: `mentor-second-${stamp}@demo.ikiraro.test`,
			name: "Second learner",
		});
		const minor = await createUserWithPassport(db, {
			email: `mentor-minor-${stamp}@demo.ikiraro.test`,
			name: "Minor learner",
		});
		const partner = await createUserWithPassport(db, {
			email: `mentor-partner-${stamp}@demo.ikiraro.test`,
			name: "Partner applicant",
		});
		await db
			.update(users)
			.set({ dateOfBirth: "1990-04-02" })
			.where(eq(users.id, learner.userId));
		await db
			.update(users)
			.set({ dateOfBirth: "1992-04-02" })
			.where(eq(users.id, second.userId));
		await db
			.update(users)
			.set({ dateOfBirth: "2014-04-02" })
			.where(eq(users.id, minor.userId));
		await db
			.update(users)
			.set({ dateOfBirth: "1988-04-02" })
			.where(eq(users.id, applicant.userId));
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
			.values({ code: `mp-${stamp}`, name: `Mentor province ${stamp}` })
			.returning({ id: provinces.id });
		const [district] = await db
			.insert(districts)
			.values({
				provinceId: province?.id ?? "",
				code: `md-${stamp}`,
				name: `Mentor district ${stamp}`,
			})
			.returning({ id: districts.id });
		if (!district) throw new Error("the district was not stored");

		expect(
			await reasonOf(() =>
				applyToMentor(db, {
					userId: applicant.userId,
					kind: "mentor",
					weeklyContactCap: 1.5,
				}),
			),
		).toBe("cap");
		const application = await applyToMentor(db, {
			userId: applicant.userId,
			kind: "mentor",
			weeklyContactCap: 1,
		});
		expect(
			await reasonOf(() =>
				applyToMentor(db, {
					userId: applicant.userId,
					kind: "mentor",
					weeklyContactCap: 2,
				}),
			),
		).toBe("duplicate");
		expect(
			await reasonOf(() =>
				approveMentor(db, {
					actorId: applicant.userId,
					mentorId: application.id,
				}),
			),
		).toBe("self");
		await approveMentor(db, {
			actorId: admin.userId,
			mentorId: application.id,
		});
		expect(
			await reasonOf(() =>
				approveMentor(db, {
					actorId: admin.userId,
					mentorId: application.id,
				}),
			),
		).toBe("closed");
		try {
			await db
				.update(mentors)
				.set({ weeklyContactCap: 4 })
				.where(eq(mentors.id, application.id));
			throw new Error("the cap was edited");
		} catch (error) {
			expect(errorText(error).includes("append-only")).toBe(true);
		}
		const [mentorRole] = await db
			.select({ id: userRoles.id })
			.from(userRoles)
			.innerJoin(roles, eq(roles.id, userRoles.roleId))
			.where(eq(userRoles.userId, applicant.userId));
		expect(mentorRole?.id).toBeTruthy();

		expect(
			await reasonOf(() =>
				optInToMentors(db, {
					userId: minor.userId,
					skill: "Repair",
					districtId: district.id,
				}),
			),
		).toBe("consent");
		expect(
			await reasonOf(() =>
				optInToMentors(db, {
					userId: learner.userId,
					skill: "Repair",
					districtId: district.id,
				}),
			),
		).toBe("consent");
		await recordConsent(db, {
			userId: learner.userId,
			purpose: "mentor_contact",
			granted: true,
		});
		await recordConsent(db, {
			userId: second.userId,
			purpose: "mentor_contact",
			granted: true,
		});
		const choice = await optInToMentors(db, {
			userId: learner.userId,
			skill: "Repair",
			districtId: district.id,
		});
		const other = await optInToMentors(db, {
			userId: second.userId,
			skill: "Repair",
			districtId: district.id,
		});
		const visible = await listDiscoverable(db, applicant.userId);
		expect(visible.cap).toBe(1);
		expect(
			visible.items.some(
				(row) => row.name === "Mentor learner" && row.skill === "Repair",
			),
		).toBe(true);
		expect(visible.items.some((row) => "email" in row)).toBe(false);

		const asked = await requestLearner(db, {
			userId: applicant.userId,
			optInId: choice.id,
		});
		expect(
			await reasonOf(() =>
				requestLearner(db, {
					userId: applicant.userId,
					optInId: other.id,
				}),
			),
		).toBe("cap");
		await acceptMentorRequest(db, {
			userId: learner.userId,
			requestId: asked.id,
		});
		try {
			await db
				.update(mentorRequests)
				.set({ status: "declined" })
				.where(eq(mentorRequests.id, asked.id));
			throw new Error("the request was edited");
		} catch (error) {
			expect(errorText(error).includes("append-only")).toBe(true);
		}

		const zero = await applyToMentor(db, {
			userId: admin.userId,
			kind: "mentor",
			weeklyContactCap: 0,
		});
		expect(
			await reasonOf(() =>
				approveMentor(db, {
					actorId: admin.userId,
					mentorId: zero.id,
				}),
			),
		).toBe("self");

		const partnerApplication = await applyToMentor(db, {
			userId: partner.userId,
			kind: "partner",
			weeklyContactCap: 3,
		});
		await approveMentor(db, {
			actorId: admin.userId,
			mentorId: partnerApplication.id,
		});
		expect(
			await reasonOf(() =>
				requestLearner(db, {
					userId: partner.userId,
					optInId: other.id,
				}),
			),
		).toBe("kind");
		await recordConsent(db, {
			userId: learner.userId,
			purpose: "mentor_contact",
			granted: false,
		});
		const after = await listDiscoverable(db, applicant.userId);
		expect(after.items.some((row) => row.name === "Mentor learner")).toBe(
			false,
		);
	}, 120_000);
});
