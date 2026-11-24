import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	centerStaff,
	districts,
	learningCenters,
	mentors,
	opportunities,
	referrals,
	roles,
	sectors,
	userRoles,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { readPassport } from "../learning/passport";

type BoardDb = Database;

export type OpportunityKind =
	| "job"
	| "apprenticeship"
	| "contract"
	| "training";

export type OpportunityRow = {
	id: string;
	partnerName: string;
	kind: OpportunityKind;
	title: string;
	skill: string;
	body: string;
};

export type ReferralRow = {
	id: string;
	authorName: string;
	note: string;
	shown: boolean;
};

const KINDS: readonly OpportunityKind[] = [
	"job",
	"apprenticeship",
	"contract",
	"training",
];

function isKind(value: string): value is OpportunityKind {
	return (KINDS as readonly string[]).includes(value);
}

function clean(
	value: string,
	max: number,
	reason: string,
	message: string,
): string {
	const text = value.trim();
	if (text.length < 1 || text.length > max) {
		throw errors.badRequest(message, { reason });
	}
	return text;
}

async function approvedPartner(
	database: BoardDb,
	userId: number,
): Promise<boolean> {
	const [row] = await database
		.select({ id: mentors.id })
		.from(mentors)
		.where(
			and(
				eq(mentors.userId, userId),
				eq(mentors.kind, "partner"),
				eq(mentors.status, "approved"),
			),
		)
		.limit(1);
	return Boolean(row);
}

/** An approved partner posts one opportunity. The skill is matched to a badge later. */
export async function postOpportunity(
	database: BoardDb,
	input: {
		userId: number;
		kind: string;
		title: string;
		skill: string;
		body: string;
		ip?: string;
	},
): Promise<{ id: string }> {
	if (!(await approvedPartner(database, input.userId))) {
		throw errors.forbidden("An approved partner posts an opportunity.", {
			reason: "approval",
		});
	}
	if (!isKind(input.kind)) {
		throw errors.badRequest("Choose the kind of opportunity.", {
			reason: "kind",
		});
	}
	const title = clean(input.title, 80, "title", "Name the opportunity.");
	const skill = clean(
		input.skill,
		120,
		"skill",
		"Name the skill this matches.",
	);
	const body = clean(input.body, 400, "body", "Describe the opportunity.");
	const [created] = await database
		.insert(opportunities)
		.values({
			partnerUserId: input.userId,
			kind: input.kind,
			title,
			skill,
			body,
		})
		.returning({ id: opportunities.id });
	if (!created) throw errors.internal("The opportunity was not stored.");
	await writeAudit(database, {
		actorId: input.userId,
		action: "opportunity.posted",
		metadata: { kind: input.kind },
		ipAddress: input.ip,
	});
	return created;
}

async function heldSkills(
	database: BoardDb,
	userId: number,
): Promise<Set<string>> {
	const passport = await readPassport(database, userId);
	const skills = new Set<string>();
	for (const badge of passport.badges) {
		if (badge.skillEn.trim()) skills.add(badge.skillEn.trim());
		if (badge.skillRw.trim()) skills.add(badge.skillRw.trim());
	}
	return skills;
}

function toRow(row: {
	id: string;
	partnerName: string | null;
	kind: string;
	title: string;
	skill: string;
	body: string;
}): OpportunityRow | null {
	if (!isKind(row.kind)) return null;
	return {
		id: row.id,
		partnerName: row.partnerName ?? "",
		kind: row.kind,
		title: row.title,
		skill: row.skill,
		body: row.body,
	};
}

/** Matches for this learner, and the posts this partner wrote. */
export async function listOpportunities(
	database: BoardDb,
	userId: number,
): Promise<{ matches: OpportunityRow[]; posted: OpportunityRow[] }> {
	const skills = await heldSkills(database, userId);
	const rows = await database
		.select({
			id: opportunities.id,
			partnerName: users.name,
			kind: opportunities.kind,
			title: opportunities.title,
			skill: opportunities.skill,
			body: opportunities.body,
			partnerUserId: opportunities.partnerUserId,
		})
		.from(opportunities)
		.innerJoin(users, eq(users.id, opportunities.partnerUserId))
		.orderBy(desc(opportunities.createdAt));
	const matches: OpportunityRow[] = [];
	const posted: OpportunityRow[] = [];
	for (const row of rows) {
		const item = toRow(row);
		if (!item) continue;
		if (row.partnerUserId === userId) posted.push(item);
		if (skills.has(row.skill)) matches.push(item);
	}
	return { matches, posted };
}

async function coveredLearnerIds(
	database: BoardDb,
	actorId: number,
): Promise<{ allowed: boolean; ids: number[] }> {
	const staff = await database
		.select({ centerId: centerStaff.centerId })
		.from(centerStaff)
		.where(
			and(eq(centerStaff.userId, actorId), eq(centerStaff.role, "trainer")),
		);
	const scopes = await database
		.select({ districtId: userRoles.scopeId })
		.from(userRoles)
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(
			and(
				eq(userRoles.userId, actorId),
				eq(roles.code, "district_coordinator"),
				eq(userRoles.scopeType, "district"),
				isNull(userRoles.suspendedAt),
			),
		);
	const districtIds = scopes.flatMap((row) =>
		row.districtId ? [row.districtId] : [],
	);
	const centerIds = new Set(staff.map((row) => row.centerId));
	if (districtIds.length > 0) {
		const places = await database
			.select({ id: learningCenters.id })
			.from(learningCenters)
			.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
			.innerJoin(districts, eq(districts.id, sectors.districtId))
			.where(inArray(districts.id, districtIds));
		for (const place of places) centerIds.add(place.id);
	}
	if (centerIds.size === 0) return { allowed: false, ids: [] };
	const people = await database
		.select({ id: users.id })
		.from(users)
		.where(
			and(
				inArray(users.centerId, [...centerIds]),
				sql`${users.deletedAt} is null`,
			),
		);
	return { allowed: true, ids: people.map((person) => person.id) };
}

/** Learners this trainer or coordinator can recommend. Names only. */
export async function listReferralLearners(
	database: BoardDb,
	actorId: number,
): Promise<{ id: number; name: string }[]> {
	const covered = await coveredLearnerIds(database, actorId);
	if (!covered.allowed) {
		throw errors.forbidden("A trainer or a coordinator writes a referral.", {
			reason: "scope",
		});
	}
	if (covered.ids.length === 0) return [];
	const rows = await database
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(inArray(users.id, covered.ids))
		.orderBy(users.name);
	return rows.map((row) => ({ id: row.id, name: row.name ?? "" }));
}

/** The recommendation is stored. It is not on the passport until the learner allows it. */
export async function recommendLearner(
	database: BoardDb,
	input: { actorId: number; learnerId: number; note: string; ip?: string },
): Promise<{ id: string }> {
	const note = clean(input.note, 400, "note", "Write the recommendation.");
	if (input.learnerId === input.actorId) {
		throw errors.forbidden("You recommend someone else.", { reason: "self" });
	}
	const covered = await coveredLearnerIds(database, input.actorId);
	if (!covered.allowed || !covered.ids.includes(input.learnerId)) {
		throw errors.forbidden("A trainer or a coordinator writes a referral.", {
			reason: "scope",
		});
	}
	const [created] = await database
		.insert(referrals)
		.values({
			learnerUserId: input.learnerId,
			authorUserId: input.actorId,
			note,
		})
		.returning({ id: referrals.id });
	if (!created) throw errors.internal("The referral was not stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "referral.written",
		ipAddress: input.ip,
	});
	return created;
}

export async function listOwnReferrals(
	database: BoardDb,
	userId: number,
): Promise<ReferralRow[]> {
	const rows = await database
		.select({
			id: referrals.id,
			authorName: users.name,
			note: referrals.note,
			shownAt: referrals.shownAt,
		})
		.from(referrals)
		.innerJoin(users, eq(users.id, referrals.authorUserId))
		.where(eq(referrals.learnerUserId, userId))
		.orderBy(desc(referrals.createdAt));
	return rows.map((row) => ({
		id: row.id,
		authorName: row.authorName ?? "",
		note: row.note,
		shown: row.shownAt !== null,
	}));
}

/** The learner chooses to put this recommendation on the passport. */
export async function allowReferral(
	database: BoardDb,
	input: { userId: number; referralId: string; ip?: string },
): Promise<{ id: string }> {
	const [row] = await database
		.select({
			id: referrals.id,
			learnerUserId: referrals.learnerUserId,
			shownAt: referrals.shownAt,
		})
		.from(referrals)
		.where(eq(referrals.id, input.referralId))
		.limit(1);
	if (!row) throw errors.notFound("That referral is not here.");
	if (row.learnerUserId !== input.userId) {
		throw errors.forbidden("You choose what appears on your passport.", {
			reason: "self",
		});
	}
	if (row.shownAt) {
		throw errors.conflict("This referral is already on the passport.", {
			reason: "closed",
		});
	}
	await database
		.update(referrals)
		.set({ shownAt: new Date() })
		.where(eq(referrals.id, row.id));
	await writeAudit(database, {
		actorId: input.userId,
		action: "referral.shown",
		ipAddress: input.ip,
	});
	return { id: row.id };
}
