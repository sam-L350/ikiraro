import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	allocationRounds,
	committeeDecisions,
	declaredRelationships,
	digitalPassports,
	districts,
	earnedBadges,
	hardwareGrants,
	hardwareInventory,
	type JsonValue,
	learningCenters,
	pointTransactions,
	rankingSnapshots,
	roundApplications,
	sectors,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit, writeEvent } from "../audit/write";
import { countAttendedSessions } from "../learning/center-sessions";
import { reviewConflict } from "../learning/verifications";
import {
	ageYears,
	assignRanks,
	type GrantFormula,
	parseFormula,
	rankScore,
	sameGuardian,
} from "./formula";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GrantDb = Pick<
	Database,
	"execute" | "insert" | "select" | "transaction" | "update"
>;

export type DecisionRound = {
	id: string;
	title: string;
	districtName: string;
	quantity: number;
	applications: number;
};

export type RankedApplicant = {
	applicationId: string;
	learnerName: string;
	statement: string;
	score: number | null;
	rank: number | null;
	genderMatch: boolean;
	youthMatch: boolean;
};

export type DecisionDetail = {
	id: string;
	title: string;
	districtName: string;
	quantity: number;
	formula: GrantFormula | null;
	balance: {
		gender?: { label: string; target: number; awarded: number };
		youth?: { maxAge: number; target: number; awarded: number };
	} | null;
	applicants: RankedApplicant[];
	items: { id: string; name: string; serial: string }[];
};

export type GrantResult = {
	id: string;
	decisionId: string;
	inventoryId: string;
	recipientId: number;
};

function isUuid(value: string): boolean {
	return UUID_RE.test(value);
}

function wholeMonths(from: Date, to: Date): number {
	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
	let months =
		(to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
		(to.getUTCMonth() - from.getUTCMonth());
	if (to.getUTCDate() < from.getUTCDate()) months -= 1;
	return Math.max(0, months);
}

function textOf(error: unknown): string {
	if (error instanceof Error) return `${error.message} ${textOf(error.cause)}`;
	return "";
}

function failGrant(error: unknown): never {
	const text = textOf(error);
	if (text.includes("ikiraro:self")) {
		throw errors.forbidden("You cannot decide your own application.", {
			reason: "self",
		});
	}
	if (text.includes("ikiraro:relative")) {
		throw errors.forbidden("You cannot decide for a relative.", {
			reason: "relative",
		});
	}
	if (text.includes("ikiraro:household")) {
		throw errors.forbidden("You cannot decide for someone in your household.", {
			reason: "household",
		});
	}
	if (text.includes("ikiraro:one-household")) {
		throw errors.conflict(
			"This household already has an award in this round.",
			{
				reason: "one-household",
			},
		);
	}
	if (text.includes("ikiraro:active")) {
		throw errors.conflict("This learner already has an active award.", {
			reason: "active",
		});
	}
	if (text.includes("ikiraro:quantity")) {
		throw errors.conflict("This round has awarded every item it listed.", {
			reason: "quantity",
		});
	}
	if (text.includes("ikiraro:quota")) {
		throw errors.conflict("This round has reached the quota written on it.", {
			reason: "quota",
		});
	}
	if (text.includes("ikiraro:stock") || text.includes("ikiraro:district")) {
		throw errors.conflict("That item is not in stock in this district.", {
			reason: "stock",
		});
	}
	if (text.includes("ikiraro:rank") || text.includes("ikiraro:formula")) {
		throw errors.conflict("Rank this round with a written formula first.", {
			reason: "rank",
		});
	}
	if (text.includes("ikiraro:closed")) {
		throw errors.conflict("This application already has a decision.", {
			reason: "closed",
		});
	}
	if (text.includes("ikiraro:reason")) {
		throw errors.badRequest("Write why this decision was made.", {
			reason: "reason",
		});
	}
	if (text.includes("ikiraro:key")) {
		throw errors.badRequest("This decision needs an idempotency key.", {
			reason: "key",
		});
	}
	if (text.includes("ikiraro:missing")) {
		throw errors.notFound("That application was not found.");
	}
	if (error instanceof Error) throw error;
	throw errors.internal("The grant could not be recorded.");
}

function throwConflict(kind: "self" | "relative" | "household"): never {
	if (kind === "self") {
		throw errors.forbidden("You cannot decide your own application.", {
			reason: "self",
		});
	}
	if (kind === "relative") {
		throw errors.forbidden("You cannot decide for a relative.", {
			reason: "relative",
		});
	}
	throw errors.forbidden("You cannot decide for someone in your household.", {
		reason: "household",
	});
}

function readResult(rows: unknown): unknown {
	if (!Array.isArray(rows) || rows.length === 0) return null;
	const first = rows[0] as { result?: unknown };
	const value = first.result;
	if (typeof value === "string") return JSON.parse(value) as unknown;
	return value;
}

function isGrant(value: unknown): value is GrantResult {
	if (typeof value !== "object" || value === null) return false;
	const row = value as Record<string, unknown>;
	return (
		typeof row.id === "string" &&
		typeof row.decisionId === "string" &&
		typeof row.inventoryId === "string" &&
		(typeof row.recipientId === "number" ||
			(typeof row.recipientId === "string" && row.recipientId !== ""))
	);
}

function cleanReason(value: string): string {
	const text = value.trim();
	if (text.length < 1 || text.length > 400) {
		throw errors.badRequest("Write why this decision was made.", {
			reason: "reason",
		});
	}
	return text;
}

async function blocker(
	database: GrantDb,
	actorId: number,
	learnerIds: readonly number[],
): Promise<"ok" | "self" | "relative" | "household"> {
	if (learnerIds.includes(actorId)) return "self";
	const relationships = await database
		.select({
			userId: declaredRelationships.userId,
			relatedUserId: declaredRelationships.relatedUserId,
		})
		.from(declaredRelationships)
		.where(eq(declaredRelationships.userId, actorId));
	const incoming = await database
		.select({
			userId: declaredRelationships.userId,
			relatedUserId: declaredRelationships.relatedUserId,
		})
		.from(declaredRelationships)
		.where(eq(declaredRelationships.relatedUserId, actorId));
	const related = [...relationships, ...incoming];
	for (const learnerId of learnerIds) {
		if (
			reviewConflict({
				reviewerId: actorId,
				learnerId,
				relationships: related,
			}) === "relative"
		) {
			return "relative";
		}
	}
	const ids = [actorId, ...learnerIds];
	const people = await database
		.select({ id: users.id, guardian: users.guardianContact })
		.from(users)
		.where(inArray(users.id, ids));
	const actor = people.find((person) => person.id === actorId);
	for (const learnerId of learnerIds) {
		const learner = people.find((person) => person.id === learnerId);
		if (sameGuardian(actor?.guardian ?? null, learner?.guardian ?? null)) {
			return "household";
		}
	}
	return "ok";
}

/** Rounds a committee member can rank and decide. */
export async function listDecisionRounds(
	database: GrantDb,
): Promise<DecisionRound[]> {
	const rows = await database
		.select({
			id: allocationRounds.id,
			title: allocationRounds.title,
			districtName: districts.name,
			quantity: allocationRounds.quantity,
			applications: sql<number>`(select count(*)::int from round_applications where round_id = ${allocationRounds.id})`,
		})
		.from(allocationRounds)
		.innerJoin(districts, eq(districts.id, allocationRounds.districtId))
		.orderBy(desc(allocationRounds.createdAt))
		.limit(50);
	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		districtName: row.districtName,
		quantity: row.quantity,
		applications: Number(row.applications ?? 0),
	}));
}

function snapshotRows(body: unknown): {
	applicationId: string;
	score: number;
	rank: number;
	genderMatch: boolean;
	youthMatch: boolean;
}[] {
	if (typeof body !== "object" || body === null || !("rows" in body)) return [];
	const rows = body.rows;
	if (!Array.isArray(rows)) return [];
	return rows.flatMap((row) => {
		if (typeof row !== "object" || row === null) return [];
		if (
			typeof row.applicationId !== "string" ||
			typeof row.score !== "number" ||
			typeof row.rank !== "number"
		) {
			return [];
		}
		return [
			{
				applicationId: row.applicationId,
				score: row.score,
				rank: row.rank,
				genderMatch: row.genderMatch === true,
				youthMatch: row.youthMatch === true,
			},
		];
	});
}

function snapshotBalance(body: unknown): DecisionDetail["balance"] {
	if (typeof body !== "object" || body === null || !("balance" in body))
		return null;
	const balance = body.balance;
	if (typeof balance !== "object" || balance === null) return null;
	const result: NonNullable<DecisionDetail["balance"]> = {};
	if (
		"gender" in balance &&
		typeof balance.gender === "object" &&
		balance.gender
	) {
		const gender = balance.gender as Record<string, unknown>;
		if (
			typeof gender.label === "string" &&
			typeof gender.target === "number" &&
			typeof gender.awarded === "number"
		) {
			result.gender = {
				label: gender.label,
				target: gender.target,
				awarded: gender.awarded,
			};
		}
	}
	if (
		"youth" in balance &&
		typeof balance.youth === "object" &&
		balance.youth
	) {
		const youth = balance.youth as Record<string, unknown>;
		if (
			typeof youth.maxAge === "number" &&
			typeof youth.target === "number" &&
			typeof youth.awarded === "number"
		) {
			result.youth = {
				maxAge: youth.maxAge,
				target: youth.target,
				awarded: youth.awarded,
			};
		}
	}
	return result.gender || result.youth ? result : null;
}

export async function readDecisionRound(
	database: GrantDb,
	roundId: string,
): Promise<DecisionDetail> {
	if (!isUuid(roundId)) throw errors.notFound("That round was not found.");
	const [round] = await database
		.select({
			id: allocationRounds.id,
			title: allocationRounds.title,
			quantity: allocationRounds.quantity,
			formula: allocationRounds.formula,
			districtId: allocationRounds.districtId,
			districtName: districts.name,
		})
		.from(allocationRounds)
		.innerJoin(districts, eq(districts.id, allocationRounds.districtId))
		.where(eq(allocationRounds.id, roundId))
		.limit(1);
	if (!round) throw errors.notFound("That round was not found.");
	const [snapshot] = await database
		.select({ body: rankingSnapshots.body })
		.from(rankingSnapshots)
		.where(eq(rankingSnapshots.roundId, roundId))
		.orderBy(desc(rankingSnapshots.recordedAt))
		.limit(1);
	const ranked = snapshot ? snapshotRows(snapshot.body) : [];
	const byApplication = new Map(ranked.map((row) => [row.applicationId, row]));
	const applications = await database
		.select({
			id: roundApplications.id,
			learnerName: users.name,
			statement: roundApplications.statement,
		})
		.from(roundApplications)
		.innerJoin(users, eq(users.id, roundApplications.userId))
		.where(eq(roundApplications.roundId, roundId))
		.orderBy(desc(roundApplications.createdAt));
	const items = await database
		.select({
			id: hardwareInventory.id,
			name: hardwareInventory.name,
			serial: hardwareInventory.serial,
		})
		.from(hardwareInventory)
		.innerJoin(
			learningCenters,
			eq(learningCenters.id, hardwareInventory.centerId),
		)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(
			and(
				eq(hardwareInventory.status, "in_stock"),
				eq(sectors.districtId, round.districtId),
			),
		)
		.limit(100);
	return {
		id: round.id,
		title: round.title,
		districtName: round.districtName,
		quantity: round.quantity,
		formula: parseFormula(round.formula),
		balance: snapshot ? snapshotBalance(snapshot.body) : null,
		applicants: applications.map((application) => {
			const row = byApplication.get(application.id);
			return {
				applicationId: application.id,
				learnerName: application.learnerName ?? "",
				statement: application.statement,
				score: row?.score ?? null,
				rank: row?.rank ?? null,
				genderMatch: row?.genderMatch ?? false,
				youthMatch: row?.youthMatch ?? false,
			};
		}),
		items,
	};
}

async function metricsOf(
	database: GrantDb,
	userId: number,
	now: Date,
): Promise<{
	points: number;
	badges: number;
	hours: number;
	attendance: number;
	months: number;
	gender: string | null;
	dob: string | null;
}> {
	const [person] = await database
		.select({
			registeredAt: users.createdAt,
			gender: users.gender,
			dob: users.dateOfBirth,
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	const [pointsRow] = await database
		.select({
			total: sql<number>`coalesce(sum(${pointTransactions.amount}), 0)::int`,
		})
		.from(pointTransactions)
		.where(eq(pointTransactions.userId, userId));
	const [passport] = await database
		.select({ minutes: digitalPassports.verifiedMinutes })
		.from(digitalPassports)
		.where(eq(digitalPassports.userId, userId))
		.limit(1);
	const badgeRows = await database
		.select({ badgeId: earnedBadges.badgeId, entry: earnedBadges.entry })
		.from(earnedBadges)
		.where(eq(earnedBadges.userId, userId));
	const revoked = new Set(
		badgeRows
			.filter((row) => row.entry === "revoked")
			.map((row) => row.badgeId),
	);
	const badges = new Set(
		badgeRows
			.filter((row) => row.entry === "awarded" && !revoked.has(row.badgeId))
			.map((row) => row.badgeId),
	);
	return {
		points: Number(pointsRow?.total ?? 0),
		badges: badges.size,
		hours: Math.floor((passport?.minutes ?? 0) / 60),
		attendance: await countAttendedSessions(database, userId),
		months: person ? wholeMonths(person.registeredAt, now) : 0,
		gender: person?.gender ?? null,
		dob: person?.dob ?? null,
	};
}

/** Store the formula and a ranking snapshot. The score uses only those weights. */
export async function rankRound(
	database: GrantDb,
	input: { actorId: number; roundId: string; formula: unknown; ip: string },
): Promise<{ id: string }> {
	if (!isUuid(input.roundId))
		throw errors.notFound("That round was not found.");
	const formula = parseFormula(input.formula);
	if (!formula) {
		throw errors.badRequest("Write the formula for this round.", {
			reason: "formula",
		});
	}
	const applications = await database
		.select({
			id: roundApplications.id,
			userId: roundApplications.userId,
			createdAt: roundApplications.createdAt,
		})
		.from(roundApplications)
		.where(eq(roundApplications.roundId, input.roundId));
	if (applications.length === 0) {
		throw errors.conflict("No one has applied to this round.", {
			reason: "empty",
		});
	}
	const conflict = await blocker(
		database,
		input.actorId,
		applications.map((row) => row.userId),
	);
	if (conflict !== "ok") throwConflict(conflict);
	const now = new Date();
	const measured = [];
	for (const application of applications) {
		const metrics = await metricsOf(database, application.userId, now);
		const genderMatch = formula.genderTarget
			? (metrics.gender?.trim().toLowerCase() ?? "") ===
				formula.genderTarget.gender.trim().toLowerCase()
			: false;
		const age = ageYears(metrics.dob, now);
		const youthMatch = formula.youthTarget
			? age !== null && age <= formula.youthTarget.maxAge
			: false;
		measured.push({
			applicationId: application.id,
			userId: application.userId,
			score: rankScore(metrics, formula.weights),
			at: application.createdAt.getTime(),
			genderMatch,
			youthMatch,
		});
	}
	const ranked = assignRanks(measured, formula.tieBreak);
	const awarded = await database
		.select({
			gender: users.gender,
			dob: users.dateOfBirth,
		})
		.from(hardwareGrants)
		.innerJoin(users, eq(users.id, hardwareGrants.recipientUserId))
		.where(eq(hardwareGrants.roundId, input.roundId));
	const balance: {
		gender?: { label: string; target: number; awarded: number };
		youth?: { maxAge: number; target: number; awarded: number };
	} = {};
	if (formula.genderTarget) {
		const label = formula.genderTarget.gender.trim().toLowerCase();
		balance.gender = {
			label: formula.genderTarget.gender.trim(),
			target: formula.genderTarget.count,
			awarded: awarded.filter(
				(row) => (row.gender?.trim().toLowerCase() ?? "") === label,
			).length,
		};
	}
	if (formula.youthTarget) {
		const youthTarget = formula.youthTarget;
		balance.youth = {
			maxAge: youthTarget.maxAge,
			target: youthTarget.count,
			awarded: awarded.filter((row) => {
				const age = ageYears(row.dob, now);
				return age !== null && age <= youthTarget.maxAge;
			}).length,
		};
	}
	const body = {
		formula,
		rows: ranked.map((row) => ({
			applicationId: row.applicationId,
			userId: row.userId,
			score: row.score,
			rank: row.rank,
			genderMatch: row.genderMatch,
			youthMatch: row.youthMatch,
		})),
		balance,
	};
	return database.transaction(async (tx) => {
		const updated = await tx
			.update(allocationRounds)
			.set({ formula: formula as JsonValue })
			.where(eq(allocationRounds.id, input.roundId))
			.returning({ id: allocationRounds.id });
		if (updated.length === 0)
			throw errors.notFound("That round was not found.");
		const [snapshot] = await tx
			.insert(rankingSnapshots)
			.values({
				roundId: input.roundId,
				body: body as JsonValue,
				recordedByUserId: input.actorId,
			})
			.returning({ id: rankingSnapshots.id });
		if (!snapshot) throw errors.internal("The ranking was not stored.");
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "round.ranked",
			targetType: "ranking_snapshot",
			targetId: snapshot.id,
			ipAddress: input.ip,
			metadata: { roundId: input.roundId },
		});
		return { id: snapshot.id };
	});
}

/** Award through `decide_grant`, so the decision, grant, and stock move together. */
export async function decideGrant(
	database: GrantDb,
	input: {
		actorId: number;
		roundId: string;
		applicationId: string;
		inventoryId: string;
		reason: string;
		idempotencyKey: string;
		ip: string;
	},
): Promise<GrantResult> {
	const key = input.idempotencyKey.trim();
	if (key.length < 1 || key.length > 80) {
		throw errors.badRequest("This decision needs an idempotency key.", {
			reason: "key",
		});
	}
	try {
		const rows = await database.execute(sql`
			select decide_grant(
				${input.roundId}::uuid,
				${input.applicationId}::uuid,
				${input.inventoryId}::uuid,
				${input.actorId},
				${input.reason},
				${key},
				${input.ip}
			) as result
		`);
		const result = readResult(rows);
		if (!isGrant(result)) throw errors.internal("The grant could not be read.");
		return {
			...result,
			recipientId: Number(result.recipientId),
		};
	} catch (error) {
		failGrant(error);
	}
}

/** Record a no without moving an item. The reason stays on the decision. */
export async function declineApplication(
	database: GrantDb,
	input: {
		actorId: number;
		roundId: string;
		applicationId: string;
		reason: string;
		ip: string;
	},
): Promise<{ id: string }> {
	if (!isUuid(input.roundId) || !isUuid(input.applicationId)) {
		throw errors.notFound("That application was not found.");
	}
	const reason = cleanReason(input.reason);
	const [application] = await database
		.select({ userId: roundApplications.userId })
		.from(roundApplications)
		.where(
			and(
				eq(roundApplications.id, input.applicationId),
				eq(roundApplications.roundId, input.roundId),
			),
		)
		.limit(1);
	if (!application) throw errors.notFound("That application was not found.");
	const conflict = await blocker(database, input.actorId, [application.userId]);
	if (conflict !== "ok") throwConflict(conflict);
	const [snapshot] = await database
		.select({ id: rankingSnapshots.id, body: rankingSnapshots.body })
		.from(rankingSnapshots)
		.where(eq(rankingSnapshots.roundId, input.roundId))
		.orderBy(desc(rankingSnapshots.recordedAt))
		.limit(1);
	if (!snapshot) {
		throw errors.conflict("Rank this round with a written formula first.", {
			reason: "rank",
		});
	}
	const listed = snapshotRows(snapshot.body).some(
		(row) => row.applicationId === input.applicationId,
	);
	if (!listed) {
		throw errors.conflict("Rank this round with a written formula first.", {
			reason: "rank",
		});
	}
	const [existing] = await database
		.select({ id: committeeDecisions.id })
		.from(committeeDecisions)
		.where(eq(committeeDecisions.applicationId, input.applicationId))
		.limit(1);
	if (existing) {
		throw errors.conflict("This application already has a decision.", {
			reason: "closed",
		});
	}
	return database.transaction(async (tx) => {
		const [row] = await tx
			.insert(committeeDecisions)
			.values({
				roundId: input.roundId,
				applicationId: input.applicationId,
				snapshotId: snapshot.id,
				decision: "declined",
				reason,
				decidedByUserId: input.actorId,
			})
			.returning({ id: committeeDecisions.id });
		if (!row) throw errors.internal("The decision was not stored.");
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "grant.declined",
			targetType: "committee_decision",
			targetId: row.id,
			ipAddress: input.ip,
			metadata: { roundId: input.roundId },
		});
		await writeEvent(tx, {
			name: "grant.decided",
			payload: { userId: application.userId },
		});
		return { id: row.id };
	});
}
