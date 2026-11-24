import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	centerStaff,
	declaredRelationships,
	learningCenters,
	outcomeSurveys,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { reviewConflict } from "../learning/verifications";

type SurveyDb = Database;

export type SurveyKind = "baseline" | "endline";

export type SurveyAnswers = {
	digitalConfidence: number;
	tasksDigital: number;
	income: number;
	services: string;
	jobsOrCustomers: number;
};

export type StoredSurvey = SurveyAnswers & {
	id: string;
	kind: SurveyKind;
	verified: boolean;
};

export type SurveyChange = {
	digitalConfidence: number;
	tasksDigital: number;
	income: number;
	jobsOrCustomers: number;
};

export type SurveyPair = {
	baseline: StoredSurvey | null;
	endline: StoredSurvey | null;
	change: SurveyChange | null;
};

export type SurveyQueueRow = {
	id: string;
	kind: SurveyKind;
	learnerName: string;
	centerName: string;
	digitalConfidence: number;
	tasksDigital: number;
	income: number;
	services: string;
	jobsOrCustomers: number;
};

/** The difference between the two stored surveys. Services stay as text. */
export function surveyChange(
	baseline: SurveyAnswers,
	endline: SurveyAnswers,
): SurveyChange {
	return {
		digitalConfidence: endline.digitalConfidence - baseline.digitalConfidence,
		tasksDigital: endline.tasksDigital - baseline.tasksDigital,
		income: endline.income - baseline.income,
		jobsOrCustomers: endline.jobsOrCustomers - baseline.jobsOrCustomers,
	};
}

function whole(value: number, reason: string, max: number): number {
	if (!Number.isInteger(value) || value < 0 || value > max) {
		throw errors.badRequest("Enter a whole number.", { reason });
	}
	return value;
}

function answersOf(input: SurveyAnswers): SurveyAnswers {
	const services = input.services.trim();
	if (services.length < 1 || services.length > 400) {
		throw errors.badRequest("Write the services.", { reason: "services" });
	}
	if (
		!Number.isInteger(input.digitalConfidence) ||
		input.digitalConfidence < 0 ||
		input.digitalConfidence > 10
	) {
		throw errors.badRequest("Choose a confidence from 0 to 10.", {
			reason: "confidence",
		});
	}
	return {
		digitalConfidence: input.digitalConfidence,
		tasksDigital: whole(input.tasksDigital, "tasks", 100_000),
		income: whole(input.income, "income", 1_000_000_000),
		services,
		jobsOrCustomers: whole(input.jobsOrCustomers, "jobs", 100_000),
	};
}

function isKind(value: string): value is SurveyKind {
	return value === "baseline" || value === "endline";
}

function stored(row: {
	id: string;
	kind: string;
	digitalConfidence: number;
	tasksDigital: number;
	income: number;
	services: string;
	jobsOrCustomers: number;
	verifiedAt: Date | null;
}): StoredSurvey | null {
	if (!isKind(row.kind)) return null;
	return {
		id: row.id,
		kind: row.kind,
		digitalConfidence: row.digitalConfidence,
		tasksDigital: row.tasksDigital,
		income: row.income,
		services: row.services,
		jobsOrCustomers: row.jobsOrCustomers,
		verified: row.verifiedAt !== null,
	};
}

async function requireActive(
	database: SurveyDb,
	userId: number,
): Promise<void> {
	const [person] = await database
		.select({ activatedAt: users.activatedAt, deletedAt: users.deletedAt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!person || person.deletedAt || !person.activatedAt) {
		throw errors.conflict("Finish registration before this survey.", {
			reason: "activation",
		});
	}
}

/** The learner's baseline, endline, and the change once both exist. */
export async function readSurveys(
	database: SurveyDb,
	userId: number,
): Promise<SurveyPair> {
	const rows = await database
		.select({
			id: outcomeSurveys.id,
			kind: outcomeSurveys.kind,
			digitalConfidence: outcomeSurveys.digitalConfidence,
			tasksDigital: outcomeSurveys.tasksDigital,
			income: outcomeSurveys.income,
			services: outcomeSurveys.services,
			jobsOrCustomers: outcomeSurveys.jobsOrCustomers,
			verifiedAt: outcomeSurveys.verifiedAt,
		})
		.from(outcomeSurveys)
		.where(eq(outcomeSurveys.userId, userId));
	const baseline =
		rows.map(stored).find((row) => row?.kind === "baseline") ?? null;
	const endline =
		rows.map(stored).find((row) => row?.kind === "endline") ?? null;
	return {
		baseline,
		endline,
		change: baseline && endline ? surveyChange(baseline, endline) : null,
	};
}

async function insertSurvey(
	database: SurveyDb,
	input: {
		userId: number;
		kind: SurveyKind;
		answers: SurveyAnswers;
		ip: string;
	},
): Promise<{ id: string }> {
	await requireActive(database, input.userId);
	if (input.kind === "endline") {
		const pair = await readSurveys(database, input.userId);
		if (!pair.baseline) {
			throw errors.conflict("The baseline comes first.", {
				reason: "baseline",
			});
		}
	}
	const answers = answersOf(input.answers);
	try {
		const [created] = await database
			.insert(outcomeSurveys)
			.values({ userId: input.userId, kind: input.kind, ...answers })
			.returning({ id: outcomeSurveys.id });
		if (!created) throw errors.internal("The survey was not stored.");
		await writeAudit(database, {
			actorId: input.userId,
			action: "survey.recorded",
			targetType: "outcome_survey",
			targetId: created.id,
			ipAddress: input.ip,
			metadata: { kind: input.kind },
		});
		return { id: created.id };
	} catch (error) {
		if (isUnique(error)) {
			throw errors.conflict("This survey is already stored.", {
				reason: "duplicate",
			});
		}
		throw error;
	}
}

function isUnique(error: unknown): boolean {
	let current: unknown = error;
	while (current && typeof current === "object") {
		if ("code" in current && (current as { code?: unknown }).code === "23505") {
			return true;
		}
		current =
			"cause" in current ? (current as { cause?: unknown }).cause : undefined;
	}
	return false;
}

/** The starting survey. An earlier registration can still fill it in. */
export async function recordBaseline(
	database: SurveyDb,
	input: { userId: number; answers: SurveyAnswers; ip: string },
): Promise<{ id: string }> {
	return insertSurvey(database, { ...input, kind: "baseline" });
}

/** The later survey. It waits until the baseline is stored. */
export async function recordEndline(
	database: SurveyDb,
	input: { userId: number; answers: SurveyAnswers; ip: string },
): Promise<{ id: string }> {
	return insertSurvey(database, { ...input, kind: "endline" });
}

/** Unverified surveys for the centers this trainer covers. */
export async function listSurveyQueue(
	database: SurveyDb,
	centerIds: readonly string[] | null,
): Promise<SurveyQueueRow[]> {
	if (centerIds !== null && centerIds.length === 0) return [];
	const rows = await database
		.select({
			id: outcomeSurveys.id,
			kind: outcomeSurveys.kind,
			learnerName: users.name,
			centerName: learningCenters.name,
			digitalConfidence: outcomeSurveys.digitalConfidence,
			tasksDigital: outcomeSurveys.tasksDigital,
			income: outcomeSurveys.income,
			services: outcomeSurveys.services,
			jobsOrCustomers: outcomeSurveys.jobsOrCustomers,
		})
		.from(outcomeSurveys)
		.innerJoin(users, eq(users.id, outcomeSurveys.userId))
		.innerJoin(learningCenters, eq(learningCenters.id, users.centerId))
		.where(
			and(
				isNull(outcomeSurveys.verifiedAt),
				centerIds === null
					? undefined
					: inArray(learningCenters.id, [...centerIds]),
			),
		)
		.orderBy(asc(outcomeSurveys.recordedAt));
	return rows.flatMap((row) => {
		if (!isKind(row.kind)) return [];
		return [
			{
				id: row.id,
				kind: row.kind,
				learnerName: row.learnerName ?? "",
				centerName: row.centerName,
				digitalConfidence: row.digitalConfidence,
				tasksDigital: row.tasksDigital,
				income: row.income,
				services: row.services,
				jobsOrCustomers: row.jobsOrCustomers,
			},
		];
	});
}

/** A trainer at the learner's center may confirm the survey. The answers stay. */
export async function confirmSurvey(
	database: SurveyDb,
	input: { surveyId: string; actorId: number; note: string; ip: string },
): Promise<{ id: string }> {
	const note = input.note.trim();
	if (note.length < 1 || note.length > 400) {
		throw errors.badRequest("Write what you checked.", { reason: "note" });
	}
	const [survey] = await database
		.select({
			id: outcomeSurveys.id,
			userId: outcomeSurveys.userId,
			verifiedAt: outcomeSurveys.verifiedAt,
			centerId: users.centerId,
		})
		.from(outcomeSurveys)
		.innerJoin(users, eq(users.id, outcomeSurveys.userId))
		.where(eq(outcomeSurveys.id, input.surveyId))
		.limit(1);
	if (!survey) throw errors.notFound("That survey was not found.");
	if (survey.verifiedAt) {
		throw errors.conflict("This survey is already confirmed.", {
			reason: "closed",
		});
	}
	const relationships = await database
		.select({
			userId: declaredRelationships.userId,
			relatedUserId: declaredRelationships.relatedUserId,
		})
		.from(declaredRelationships)
		.where(
			sql`${declaredRelationships.userId} = ${input.actorId} or ${declaredRelationships.relatedUserId} = ${input.actorId}`,
		);
	const conflict = reviewConflict({
		reviewerId: input.actorId,
		learnerId: survey.userId,
		relationships,
	});
	if (conflict === "self") {
		throw errors.forbidden("You cannot confirm your own survey.", {
			reason: "self",
		});
	}
	if (conflict === "relative") {
		throw errors.forbidden("You cannot confirm a relative.", {
			reason: "relative",
		});
	}
	if (!survey.centerId) {
		throw errors.conflict("This learner has no center.", { reason: "center" });
	}
	const [staff] = await database
		.select({ id: centerStaff.id })
		.from(centerStaff)
		.where(
			and(
				eq(centerStaff.centerId, survey.centerId),
				eq(centerStaff.userId, input.actorId),
				inArray(centerStaff.role, ["trainer", "center_manager"]),
			),
		)
		.limit(1);
	if (!staff) {
		throw errors.forbidden("A trainer at the learner's center confirms this.", {
			reason: "center",
		});
	}
	const updated = await database
		.update(outcomeSurveys)
		.set({
			verifiedAt: new Date(),
			verifiedByUserId: input.actorId,
			verificationNote: note,
		})
		.where(
			and(eq(outcomeSurveys.id, survey.id), isNull(outcomeSurveys.verifiedAt)),
		)
		.returning({ id: outcomeSurveys.id });
	if (updated.length === 0) {
		throw errors.conflict("This survey is already confirmed.", {
			reason: "closed",
		});
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "survey.confirmed",
		targetType: "outcome_survey",
		targetId: survey.id,
		ipAddress: input.ip,
		metadata: { userId: survey.userId },
	});
	return { id: survey.id };
}
