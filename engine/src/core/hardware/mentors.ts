import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	districts,
	mentorOptIns,
	mentorRequests,
	mentors,
	roles,
	userRoles,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { isUnder18 } from "../identity/age";
import { currentConsents } from "../identity/consent";

type MentorDb = Database;

export type MentorKind = "mentor" | "partner";

export type MentorApplication = {
	id: string;
	kind: MentorKind;
	weeklyContactCap: number;
	status: "pending" | "approved" | "declined";
};

export type MentorOptIn = {
	id: string;
	skill: string;
	districtId: string;
	districtName: string;
};

export type MentorRequestRow = {
	id: string;
	mentorName: string;
	skill: string;
	districtName: string;
	status: "pending" | "accepted" | "declined";
};

export type DiscoverableLearner = {
	id: string;
	name: string;
	skill: string;
	districtName: string;
};

export type PendingMentor = {
	id: string;
	name: string;
	kind: MentorKind;
	weeklyContactCap: number;
};

function openStatus(value: string | undefined): "pending" | "approved" | null {
	if (value === "pending" || value === "approved") return value;
	return null;
}

function isKind(value: string): value is MentorKind {
	return value === "mentor" || value === "partner";
}

function isUnique(error: unknown): boolean {
	if (typeof error === "object" && error !== null && "code" in error) {
		if (error.code === "23505") return true;
	}
	if (error instanceof Error && error.cause) return isUnique(error.cause);
	return false;
}

function weekStart(now: Date): Date {
	const day = now.getUTCDay();
	const monday = day === 0 ? 6 : day - 1;
	return new Date(
		Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth(),
			now.getUTCDate() - monday,
		),
	);
}

function capFrom(value: number): number {
	if (!Number.isInteger(value) || value < 0 || value > 10000) {
		throw errors.badRequest(
			"Type how many people you will contact this week.",
			{
				reason: "cap",
			},
		);
	}
	return value;
}

async function allowsContact(
	database: MentorDb,
	userId: number,
): Promise<boolean> {
	const [person] = await database
		.select({ dateOfBirth: users.dateOfBirth, deletedAt: users.deletedAt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!person || person.deletedAt) return false;
	if (!person.dateOfBirth || isUnder18(person.dateOfBirth)) return false;
	const rows = await currentConsents(database, userId);
	return rows.some((row) => row.purpose === "mentor_contact" && row.granted);
}

/** A person asks an admin to approve them, and types their own weekly cap. */
export async function applyToMentor(
	database: MentorDb,
	input: {
		userId: number;
		kind: string;
		weeklyContactCap: number;
		ip?: string;
	},
): Promise<{ id: string }> {
	if (!isKind(input.kind)) {
		throw errors.badRequest("Choose mentor or partner.", { reason: "kind" });
	}
	const weeklyContactCap = capFrom(input.weeklyContactCap);
	try {
		const [created] = await database
			.insert(mentors)
			.values({
				userId: input.userId,
				kind: input.kind,
				weeklyContactCap,
			})
			.returning({ id: mentors.id });
		if (!created) throw errors.internal("The application was not stored.");
		await writeAudit(database, {
			actorId: input.userId,
			action: "mentor.applied",
			metadata: { kind: input.kind },
			ipAddress: input.ip,
		});
		return created;
	} catch (error) {
		if (isUnique(error)) {
			throw errors.conflict("An application is already open.", {
				reason: "duplicate",
			});
		}
		throw error;
	}
}

async function pendingMentor(database: MentorDb, id: string) {
	const [row] = await database
		.select({
			id: mentors.id,
			userId: mentors.userId,
			kind: mentors.kind,
			status: mentors.status,
		})
		.from(mentors)
		.where(eq(mentors.id, id))
		.limit(1);
	if (!row || !isKind(row.kind))
		throw errors.notFound("That application is not here.");
	if (row.status !== "pending") {
		throw errors.conflict("This application is already decided.", {
			reason: "closed",
		});
	}
	return row;
}

/** An admin approves someone else. A mentor then receives the mentor role. */
export async function approveMentor(
	database: MentorDb,
	input: { actorId: number; mentorId: string; ip?: string },
): Promise<{ id: string }> {
	const row = await pendingMentor(database, input.mentorId);
	if (row.userId === input.actorId) {
		throw errors.forbidden("Someone else approves this application.", {
			reason: "self",
		});
	}
	await database
		.update(mentors)
		.set({
			status: "approved",
			decidedByUserId: input.actorId,
			decidedAt: new Date(),
		})
		.where(eq(mentors.id, row.id));
	if (row.kind === "mentor") {
		const [role] = await database
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.code, "mentor"))
			.limit(1);
		if (!role) throw errors.internal("The mentor role is not available yet.");
		await database
			.insert(userRoles)
			.values({
				userId: row.userId,
				roleId: role.id,
				scopeType: "self",
				scopeId: String(row.userId),
			})
			.onConflictDoNothing();
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "mentor.approved",
		metadata: { kind: row.kind },
		ipAddress: input.ip,
	});
	return { id: row.id };
}

/** An admin declines someone else and writes why. */
export async function declineMentor(
	database: MentorDb,
	input: { actorId: number; mentorId: string; note: string; ip?: string },
): Promise<{ id: string }> {
	const note = input.note.trim();
	if (note.length < 1 || note.length > 400) {
		throw errors.badRequest("Write why this application is declined.", {
			reason: "note",
		});
	}
	const row = await pendingMentor(database, input.mentorId);
	if (row.userId === input.actorId) {
		throw errors.forbidden("Someone else declines this application.", {
			reason: "self",
		});
	}
	await database
		.update(mentors)
		.set({
			status: "declined",
			note,
			decidedByUserId: input.actorId,
			decidedAt: new Date(),
		})
		.where(eq(mentors.id, row.id));
	await writeAudit(database, {
		actorId: input.actorId,
		action: "mentor.declined",
		ipAddress: input.ip,
	});
	return { id: row.id };
}

export async function listPendingMentors(
	database: MentorDb,
): Promise<PendingMentor[]> {
	const rows = await database
		.select({
			id: mentors.id,
			name: users.name,
			kind: mentors.kind,
			weeklyContactCap: mentors.weeklyContactCap,
		})
		.from(mentors)
		.innerJoin(users, eq(users.id, mentors.userId))
		.where(eq(mentors.status, "pending"))
		.orderBy(desc(mentors.createdAt));
	return rows.flatMap((row) => {
		if (!isKind(row.kind)) return [];
		return [
			{
				id: row.id,
				name: row.name ?? "",
				kind: row.kind,
				weeklyContactCap: row.weeklyContactCap,
			},
		];
	});
}

/** The learner chooses a skill and a district. Mentor contact must already be on. */
export async function optInToMentors(
	database: MentorDb,
	input: { userId: number; skill: string; districtId: string; ip?: string },
): Promise<{ id: string }> {
	const skill = input.skill.trim();
	if (skill.length < 1 || skill.length > 80) {
		throw errors.badRequest("Name the skill.", { reason: "skill" });
	}
	const [district] = await database
		.select({ id: districts.id })
		.from(districts)
		.where(eq(districts.id, input.districtId))
		.limit(1);
	if (!district) {
		throw errors.badRequest("Choose a district.", { reason: "district" });
	}
	if (!(await allowsContact(database, input.userId))) {
		throw errors.conflict(
			"Mentor contact stays off until you allow it, and until you are 18.",
			{ reason: "consent" },
		);
	}
	try {
		const [created] = await database
			.insert(mentorOptIns)
			.values({ userId: input.userId, skill, districtId: district.id })
			.returning({ id: mentorOptIns.id });
		if (!created) throw errors.internal("The opt-in was not stored.");
		await writeAudit(database, {
			actorId: input.userId,
			action: "mentor.opted_in",
			metadata: { skill },
			ipAddress: input.ip,
		});
		return created;
	} catch (error) {
		if (isUnique(error)) {
			throw errors.conflict("That skill and district are already chosen.", {
				reason: "duplicate",
			});
		}
		throw error;
	}
}

export async function withdrawMentorOptIn(
	database: MentorDb,
	input: { userId: number; optInId: string },
): Promise<{ id: string }> {
	const [row] = await database
		.select({ id: mentorOptIns.id, userId: mentorOptIns.userId })
		.from(mentorOptIns)
		.where(eq(mentorOptIns.id, input.optInId))
		.limit(1);
	if (!row) throw errors.notFound("That choice is not here.");
	if (row.userId !== input.userId) {
		throw errors.forbidden("You withdraw your own choice.", { reason: "self" });
	}
	await database.delete(mentorOptIns).where(eq(mentorOptIns.id, row.id));
	return { id: row.id };
}

export async function readOwnMentorship(
	database: MentorDb,
	userId: number,
): Promise<{
	application: MentorApplication | null;
	optIns: MentorOptIn[];
	requests: MentorRequestRow[];
	districts: { id: string; name: string }[];
	mentorContact: boolean;
}> {
	const applications = await database
		.select({
			id: mentors.id,
			kind: mentors.kind,
			weeklyContactCap: mentors.weeklyContactCap,
			status: mentors.status,
		})
		.from(mentors)
		.where(eq(mentors.userId, userId))
		.orderBy(desc(mentors.createdAt));
	const open =
		applications.find(
			(row) => row.status === "pending" || row.status === "approved",
		) ?? null;
	const status = openStatus(open?.status);
	const application =
		open && status && isKind(open.kind)
			? {
					id: open.id,
					kind: open.kind,
					weeklyContactCap: open.weeklyContactCap,
					status,
				}
			: null;
	const optIns = await database
		.select({
			id: mentorOptIns.id,
			skill: mentorOptIns.skill,
			districtId: mentorOptIns.districtId,
			districtName: districts.name,
		})
		.from(mentorOptIns)
		.innerJoin(districts, eq(districts.id, mentorOptIns.districtId))
		.where(eq(mentorOptIns.userId, userId));
	const requests = await database
		.select({
			id: mentorRequests.id,
			mentorName: users.name,
			skill: mentorOptIns.skill,
			districtName: districts.name,
			status: mentorRequests.status,
		})
		.from(mentorRequests)
		.innerJoin(mentors, eq(mentors.id, mentorRequests.mentorId))
		.innerJoin(users, eq(users.id, mentors.userId))
		.innerJoin(mentorOptIns, eq(mentorOptIns.id, mentorRequests.optInId))
		.innerJoin(districts, eq(districts.id, mentorOptIns.districtId))
		.where(eq(mentorRequests.learnerUserId, userId))
		.orderBy(desc(mentorRequests.createdAt));
	const places = await database
		.select({ id: districts.id, name: districts.name })
		.from(districts)
		.orderBy(districts.name);
	return {
		application,
		optIns,
		requests: requests.flatMap((row) => {
			if (
				row.status !== "pending" &&
				row.status !== "accepted" &&
				row.status !== "declined"
			) {
				return [];
			}
			return [
				{
					id: row.id,
					mentorName: row.mentorName ?? "",
					skill: row.skill,
					districtName: row.districtName,
					status: row.status,
				},
			];
		}),
		districts: places,
		mentorContact: await allowsContact(database, userId),
	};
}

/** Approved mentors see learners who opted in and still allow contact. */
export async function listDiscoverable(
	database: MentorDb,
	userId: number,
): Promise<{ cap: number; used: number; items: DiscoverableLearner[] }> {
	const [mentor] = await database
		.select({
			id: mentors.id,
			kind: mentors.kind,
			weeklyContactCap: mentors.weeklyContactCap,
		})
		.from(mentors)
		.where(and(eq(mentors.userId, userId), eq(mentors.status, "approved")))
		.limit(1);
	if (mentor?.kind !== "mentor") {
		throw errors.forbidden("An approved mentor sees these learners.", {
			reason: "approval",
		});
	}
	const used = await contactsThisWeek(database, mentor.id);
	const rows = await database
		.select({
			id: mentorOptIns.id,
			name: users.name,
			skill: mentorOptIns.skill,
			districtName: districts.name,
			userId: users.id,
		})
		.from(mentorOptIns)
		.innerJoin(users, eq(users.id, mentorOptIns.userId))
		.innerJoin(districts, eq(districts.id, mentorOptIns.districtId))
		.where(
			and(
				sql`${users.deletedAt} is null`,
				sql`${users.dateOfBirth} is not null`,
				sql`${users.dateOfBirth} <= current_date - interval '18 years'`,
				sql`(
					select granted
					from consents
					where user_id = ${users.id}
					and purpose = 'mentor_contact'
					order by granted_at desc
					limit 1
				) = true`,
			),
		);
	return {
		cap: mentor.weeklyContactCap,
		used,
		items: rows.map((row) => ({
			id: row.id,
			name: row.name ?? "",
			skill: row.skill,
			districtName: row.districtName,
		})),
	};
}

async function contactsThisWeek(
	database: MentorDb,
	mentorId: string,
): Promise<number> {
	const [row] = await database
		.select({ count: sql<number>`count(*)::int` })
		.from(mentorRequests)
		.where(
			and(
				eq(mentorRequests.mentorId, mentorId),
				gte(mentorRequests.createdAt, weekStart(new Date())),
			),
		);
	return Number(row?.count ?? 0);
}

/** The request counts toward the cap the mentor typed, including a cap of zero. */
export async function requestLearner(
	database: MentorDb,
	input: { userId: number; optInId: string; ip?: string },
): Promise<{ id: string }> {
	const [mentor] = await database
		.select({
			id: mentors.id,
			kind: mentors.kind,
			weeklyContactCap: mentors.weeklyContactCap,
		})
		.from(mentors)
		.where(
			and(eq(mentors.userId, input.userId), eq(mentors.status, "approved")),
		)
		.limit(1);
	if (!mentor) {
		throw errors.conflict("An admin approves you before you can ask.", {
			reason: "approval",
		});
	}
	if (mentor.kind !== "mentor") {
		throw errors.conflict("A partner does not request a learner here.", {
			reason: "kind",
		});
	}
	const [optIn] = await database
		.select({ id: mentorOptIns.id, userId: mentorOptIns.userId })
		.from(mentorOptIns)
		.where(eq(mentorOptIns.id, input.optInId))
		.limit(1);
	if (!optIn) throw errors.notFound("That learner is not discoverable.");
	if (optIn.userId === input.userId) {
		throw errors.forbidden("You ask someone else.", { reason: "self" });
	}
	if (!(await allowsContact(database, optIn.userId))) {
		throw errors.conflict("This learner is not open to mentor contact.", {
			reason: "consent",
		});
	}
	const used = await contactsThisWeek(database, mentor.id);
	if (used >= mentor.weeklyContactCap) {
		throw errors.conflict("This week's contact cap is already used.", {
			reason: "cap",
		});
	}
	const [existing] = await database
		.select({ id: mentorRequests.id })
		.from(mentorRequests)
		.where(
			and(
				eq(mentorRequests.mentorId, mentor.id),
				eq(mentorRequests.learnerUserId, optIn.userId),
				ne(mentorRequests.status, "declined"),
			),
		)
		.limit(1);
	if (existing) {
		throw errors.conflict("A request is already open.", {
			reason: "duplicate",
		});
	}
	const [created] = await database
		.insert(mentorRequests)
		.values({
			mentorId: mentor.id,
			optInId: optIn.id,
			learnerUserId: optIn.userId,
		})
		.returning({ id: mentorRequests.id });
	if (!created) throw errors.internal("The request was not stored.");
	await writeAudit(database, {
		actorId: input.userId,
		action: "mentor.requested",
		ipAddress: input.ip,
	});
	return created;
}

async function pendingRequest(
	database: MentorDb,
	id: string,
	learnerId: number,
) {
	const [row] = await database
		.select({
			id: mentorRequests.id,
			learnerUserId: mentorRequests.learnerUserId,
			status: mentorRequests.status,
		})
		.from(mentorRequests)
		.where(eq(mentorRequests.id, id))
		.limit(1);
	if (!row) throw errors.notFound("That request is not here.");
	if (row.learnerUserId !== learnerId) {
		throw errors.forbidden("The learner accepts this request.", {
			reason: "self",
		});
	}
	if (row.status !== "pending") {
		throw errors.conflict("This request is already decided.", {
			reason: "closed",
		});
	}
	return row;
}

export async function acceptMentorRequest(
	database: MentorDb,
	input: { userId: number; requestId: string; ip?: string },
): Promise<{ id: string }> {
	const row = await pendingRequest(database, input.requestId, input.userId);
	await database
		.update(mentorRequests)
		.set({ status: "accepted", decidedAt: new Date() })
		.where(eq(mentorRequests.id, row.id));
	await writeAudit(database, {
		actorId: input.userId,
		action: "mentor.accepted",
		ipAddress: input.ip,
	});
	return { id: row.id };
}

export async function declineMentorRequest(
	database: MentorDb,
	input: { userId: number; requestId: string; ip?: string },
): Promise<{ id: string }> {
	const row = await pendingRequest(database, input.requestId, input.userId);
	await database
		.update(mentorRequests)
		.set({ status: "declined", decidedAt: new Date() })
		.where(eq(mentorRequests.id, row.id));
	await writeAudit(database, {
		actorId: input.userId,
		action: "mentor.declined_request",
		ipAddress: input.ip,
	});
	return { id: row.id };
}
