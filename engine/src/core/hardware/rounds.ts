import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	allocationRounds,
	digitalPassports,
	districts,
	earnedBadges,
	type JsonValue,
	learningCenters,
	pointTransactions,
	roundApplications,
	sectors,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { countAttendedSessions } from "../learning/center-sessions";
import {
	type EligibilityCriterion,
	type EligibilityOutcome,
	type EligibilityStatus,
	type EligibilityUser,
	evaluateEligibility,
} from "../learning/eligibility";
import { parseItemCriteria } from "./inventory";

const TITLE_LIMIT = 120;
const STATEMENT_LIMIT = 400;
const QUANTITY_LIMIT = 1000;
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RoundDb = Pick<Database, "insert" | "select" | "transaction" | "update">;

export type AllocationRound = {
	id: string;
	districtId: string;
	districtName: string;
	title: string;
	quantity: number;
	opensAt: string;
	closesAt: string;
	open: boolean;
	criteria: EligibilityCriterion[];
};

export type RoundApplicationView = {
	id: string;
	learnerName: string;
	statement: string;
	results: EligibilityOutcome[];
	createdAt: string;
};

export type RoundDetail = AllocationRound & {
	applications: RoundApplicationView[];
};

export type LearnerRound = AllocationRound & {
	results: EligibilityOutcome[];
	applied: boolean;
	statement: string | null;
};

/** A learner meets the round only when every stored check passed. An empty list passes. */
export function applicationPasses(
	results: readonly EligibilityOutcome[],
): boolean {
	return results.every((result) => result.status === "pass");
}

function isUuid(value: string): boolean {
	return UUID_RE.test(value);
}

function clean(value: string, limit: number, reason: string): string {
	const text = value.trim();
	if (text.length < 1 || text.length > limit) {
		throw errors.badRequest("That value is not usable.", { reason });
	}
	return text;
}

function quantityOf(value: number): number {
	if (!Number.isInteger(value) || value < 1 || value > QUANTITY_LIMIT) {
		throw errors.badRequest("Type how many items this round is for.", {
			reason: "quantity",
		});
	}
	return value;
}

function instant(value: string, reason: string): Date {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		throw errors.badRequest("Choose the window.", { reason });
	}
	return parsed;
}

function isOpen(opensAt: Date, closesAt: Date, now: Date): boolean {
	return (
		now.getTime() >= opensAt.getTime() && now.getTime() <= closesAt.getTime()
	);
}

function isUniqueViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if ("code" in error && error.code === "23505") return true;
	if ("cause" in error) return isUniqueViolation(error.cause);
	return false;
}

function isStatus(value: string): value is EligibilityStatus {
	return value === "pass" || value === "fail" || value === "unknown";
}

function isKind(value: string): value is EligibilityCriterion["kind"] {
	switch (value) {
		case "points":
		case "badges":
		case "hours":
		case "attendance":
		case "district":
		case "months_active":
			return true;
		default:
			return false;
	}
}

function storedResults(value: unknown): EligibilityOutcome[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		if (typeof entry !== "object" || entry === null) return [];
		if (!("kind" in entry) || !("status" in entry) || !("reason" in entry)) {
			return [];
		}
		if (typeof entry.kind !== "string" || typeof entry.status !== "string") {
			return [];
		}
		if (typeof entry.reason !== "string" || !isKind(entry.kind)) return [];
		if (!isStatus(entry.status)) return [];
		return [{ kind: entry.kind, status: entry.status, reason: entry.reason }];
	});
}

function toRound(
	row: typeof allocationRounds.$inferSelect,
	districtName: string,
	now: Date,
): AllocationRound {
	return {
		id: row.id,
		districtId: row.districtId,
		districtName,
		title: row.title,
		quantity: row.quantity,
		opensAt: row.opensAt.toISOString(),
		closesAt: row.closesAt.toISOString(),
		open: isOpen(row.opensAt, row.closesAt, now),
		criteria: parseItemCriteria(row.criteria),
	};
}

async function requireDistrict(
	database: RoundDb,
	districtId: string,
): Promise<{ id: string; name: string }> {
	if (!isUuid(districtId)) throw errors.notFound("That round was not found.");
	const [district] = await database
		.select({ id: districts.id, name: districts.name })
		.from(districts)
		.where(eq(districts.id, districtId))
		.limit(1);
	if (!district) throw errors.notFound("That district was not found.");
	return district;
}

type Applicant = EligibilityUser & { districtId: string | null };

async function loadApplicant(
	database: RoundDb,
	userId: number,
): Promise<Applicant> {
	const [person] = await database
		.select({
			registeredAt: users.createdAt,
			districtId: sectors.districtId,
		})
		.from(users)
		.leftJoin(learningCenters, eq(learningCenters.id, users.centerId))
		.leftJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(eq(users.id, userId))
		.limit(1);
	if (!person) throw errors.notFound("That learner was not found.");
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
	const badgeIds = [
		...new Set(
			badgeRows
				.filter((row) => row.entry === "awarded" && !revoked.has(row.badgeId))
				.map((row) => row.badgeId),
		),
	];
	return {
		points: Number(pointsRow?.total ?? 0),
		badgeIds,
		verifiedMinutes: passport?.minutes ?? 0,
		attendedSessions: await countAttendedSessions(database, userId),
		districtId: person.districtId,
		registeredAt: person.registeredAt,
		asOf: new Date(),
	};
}

/** Rounds a coordinator or admin can see, plus the districts they may open one for. */
export async function listRounds(
	database: RoundDb,
	input: { districtId?: string },
): Promise<{
	rounds: AllocationRound[];
	districts: { id: string; name: string }[];
}> {
	const now = new Date();
	const districtId =
		input.districtId && isUuid(input.districtId) ? input.districtId : null;
	if (input.districtId && !districtId) {
		return { rounds: [], districts: [] };
	}
	const rows = await database
		.select({
			round: allocationRounds,
			districtName: districts.name,
		})
		.from(allocationRounds)
		.innerJoin(districts, eq(districts.id, allocationRounds.districtId))
		.where(districtId ? eq(allocationRounds.districtId, districtId) : undefined)
		.orderBy(desc(allocationRounds.createdAt))
		.limit(50);
	const districtRows = await database
		.select({ id: districts.id, name: districts.name })
		.from(districts)
		.where(districtId ? eq(districts.id, districtId) : undefined)
		.orderBy(asc(districts.name))
		.limit(200);
	return {
		rounds: rows.map((row) => toRound(row.round, row.districtName, now)),
		districts: districtRows,
	};
}

export async function readRound(
	database: RoundDb,
	roundId: string,
): Promise<RoundDetail> {
	if (!isUuid(roundId)) throw errors.notFound("That round was not found.");
	const now = new Date();
	const [row] = await database
		.select({
			round: allocationRounds,
			districtName: districts.name,
		})
		.from(allocationRounds)
		.innerJoin(districts, eq(districts.id, allocationRounds.districtId))
		.where(eq(allocationRounds.id, roundId))
		.limit(1);
	if (!row) throw errors.notFound("That round was not found.");
	const applications = await database
		.select({
			id: roundApplications.id,
			learnerName: users.name,
			statement: roundApplications.statement,
			results: roundApplications.results,
			createdAt: roundApplications.createdAt,
		})
		.from(roundApplications)
		.innerJoin(users, eq(users.id, roundApplications.userId))
		.where(eq(roundApplications.roundId, roundId))
		.orderBy(desc(roundApplications.createdAt))
		.limit(100);
	return {
		...toRound(row.round, row.districtName, now),
		applications: applications.map((application) => ({
			id: application.id,
			learnerName: application.learnerName ?? "",
			statement: application.statement,
			results: storedResults(application.results),
			createdAt: application.createdAt.toISOString(),
		})),
	};
}

/** Open a round. The quantity and the rules are the ones passed in. */
export async function openRound(
	database: RoundDb,
	input: {
		actorId: number;
		districtId: string;
		title: string;
		quantity: number;
		opensAt: string;
		closesAt: string;
		criteria: unknown;
		ip: string;
	},
): Promise<{ id: string }> {
	const district = await requireDistrict(database, input.districtId);
	const title = clean(input.title, TITLE_LIMIT, "title");
	const quantity = quantityOf(input.quantity);
	const opensAt = instant(input.opensAt, "opens");
	const closesAt = instant(input.closesAt, "closes");
	if (closesAt.getTime() <= opensAt.getTime()) {
		throw errors.badRequest("The window has to end after it opens.", {
			reason: "window",
		});
	}
	const criteria = parseItemCriteria(input.criteria);
	return database.transaction(async (tx) => {
		const [row] = await tx
			.insert(allocationRounds)
			.values({
				districtId: district.id,
				title,
				quantity,
				opensAt,
				closesAt,
				criteria: criteria as JsonValue,
				openedByUserId: input.actorId,
			})
			.returning({ id: allocationRounds.id });
		if (!row) throw errors.internal("The round was not stored.");
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "round.opened",
			targetType: "allocation_round",
			targetId: row.id,
			ipAddress: input.ip,
			metadata: { districtId: district.id },
		});
		return { id: row.id };
	});
}

/** Open rounds in the learner's district, including one they already applied to. */
export async function listLearnerRounds(
	database: RoundDb,
	userId: number,
): Promise<LearnerRound[]> {
	const applicant = await loadApplicant(database, userId);
	if (!applicant.districtId) return [];
	const now = new Date();
	const openRows = await database
		.select({
			round: allocationRounds,
			districtName: districts.name,
		})
		.from(allocationRounds)
		.innerJoin(districts, eq(districts.id, allocationRounds.districtId))
		.where(
			and(
				eq(allocationRounds.districtId, applicant.districtId),
				lte(allocationRounds.opensAt, now),
				gte(allocationRounds.closesAt, now),
			),
		)
		.orderBy(desc(allocationRounds.opensAt))
		.limit(50);
	const mine = await database
		.select({
			roundId: roundApplications.roundId,
			statement: roundApplications.statement,
			results: roundApplications.results,
		})
		.from(roundApplications)
		.where(eq(roundApplications.userId, userId));
	const seen = new Set(openRows.map((row) => row.round.id));
	const extraIds = mine.map((row) => row.roundId).filter((id) => !seen.has(id));
	const extraRows =
		extraIds.length === 0
			? []
			: await database
					.select({
						round: allocationRounds,
						districtName: districts.name,
					})
					.from(allocationRounds)
					.innerJoin(districts, eq(districts.id, allocationRounds.districtId))
					.where(
						and(
							eq(allocationRounds.districtId, applicant.districtId),
							inArray(allocationRounds.id, extraIds),
						),
					);
	const applied = new Map(mine.map((row) => [row.roundId, row]));
	return [...openRows, ...extraRows].map((row) => {
		const stored = applied.get(row.round.id);
		const criteria = parseItemCriteria(row.round.criteria);
		return {
			...toRound(row.round, row.districtName, now),
			results: stored
				? storedResults(stored.results)
				: evaluateEligibility(applicant, criteria),
			applied: Boolean(stored),
			statement: stored?.statement ?? null,
		};
	});
}

/**
 * Store an application when every criterion passes.
 * A miss is refused and no row is written. The results on the row are this check.
 */
export async function applyToRound(
	database: RoundDb,
	input: { actorId: number; roundId: string; statement: string; ip: string },
): Promise<{ id: string; results: EligibilityOutcome[] }> {
	if (!isUuid(input.roundId))
		throw errors.notFound("That round was not found.");
	const statement = clean(input.statement, STATEMENT_LIMIT, "statement");
	const [round] = await database
		.select()
		.from(allocationRounds)
		.where(eq(allocationRounds.id, input.roundId))
		.limit(1);
	if (!round) throw errors.notFound("That round was not found.");
	const now = new Date();
	if (!isOpen(round.opensAt, round.closesAt, now)) {
		throw errors.conflict("This round is not open.", { reason: "window" });
	}
	const applicant = await loadApplicant(database, input.actorId);
	if (applicant.districtId !== round.districtId) {
		throw errors.forbidden("This round is for another district.");
	}
	const criteria = parseItemCriteria(round.criteria);
	const results = evaluateEligibility(applicant, criteria);
	if (!applicationPasses(results)) {
		throw errors.conflict("The rules on this round are not met.", {
			reason: "eligibility",
			results,
		});
	}
	try {
		return await database.transaction(async (tx) => {
			const [row] = await tx
				.insert(roundApplications)
				.values({
					roundId: round.id,
					userId: input.actorId,
					statement,
					results: results as JsonValue,
				})
				.returning({ id: roundApplications.id });
			if (!row) throw errors.internal("The application was not stored.");
			await writeAudit(tx, {
				actorId: input.actorId,
				action: "application.submitted",
				targetType: "round_application",
				targetId: row.id,
				ipAddress: input.ip,
				metadata: { roundId: round.id },
			});
			return { id: row.id, results };
		});
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		throw errors.conflict("You already applied to this round.", {
			reason: "duplicate",
		});
	}
}

export async function countApplications(
	database: RoundDb,
	roundId: string,
): Promise<number> {
	const [row] = await database
		.select({ taken: count() })
		.from(roundApplications)
		.where(eq(roundApplications.roundId, roundId));
	return Number(row?.taken ?? 0);
}
