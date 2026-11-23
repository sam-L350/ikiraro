import {
	and,
	asc,
	eq,
	gt,
	gte,
	inArray,
	ne,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../../db";
import {
	configSettings,
	declaredRelationships,
	enrollments,
	type JsonValue,
	learningCenters,
	pointTransactions,
	secondReviews,
	submissionVerifications,
	taskSubmissions,
	taskTranslations,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { medianMinutes } from "../operations/median";
import { reviewCenters } from "./review-queue";
import {
	isRejectReason,
	isVerificationDecision,
	REJECT_REASONS,
	type RejectReason,
	reviewConflict,
	type VerificationDecision,
} from "./verifications";

export const SECOND_EVERY_KEY = "review.second_every";
export const SECOND_NEW_EVERY_KEY = "review.second_new_every";
export const NEW_TRAINER_APPROVALS_KEY = "review.new_trainer_approvals";
export const FAST_DAYS_KEY = "points.fast_days";
export const FAST_AMOUNT_KEY = "points.fast_amount";
export const SINGLE_REVIEWER_KEY = "review.single_reviewer_min";

export const SECOND_EVERY_MIN = 1;
export const SECOND_EVERY_MAX = 20;
export const DEFAULT_SECOND_EVERY = 5;
export const SECOND_NEW_EVERY_MIN = 1;
export const SECOND_NEW_EVERY_MAX = 20;
export const DEFAULT_SECOND_NEW_EVERY = 2;
export const NEW_TRAINER_MIN = 1;
export const NEW_TRAINER_MAX = 100;
export const DEFAULT_NEW_TRAINER_APPROVALS = 10;
export const FAST_DAYS_MIN = 1;
export const FAST_DAYS_MAX = 90;
export const DEFAULT_FAST_DAYS = 7;
export const FAST_AMOUNT_MIN = 1;
export const FAST_AMOUNT_MAX = 10_000;
export const DEFAULT_FAST_AMOUNT = 100;
export const SINGLE_REVIEWER_MIN = 2;
export const SINGLE_REVIEWER_MAX = 50;
export const DEFAULT_SINGLE_REVIEWER = 3;

const NOTE_LIMIT = 500;
const LIST_LIMIT = 50;
const ANOMALY_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const SECOND_OUTCOMES = ["agreed", "disagreed"] as const;
export type SecondOutcome = (typeof SECOND_OUTCOMES)[number];
export type SecondStatus = "open" | SecondOutcome;

type SecondDb = Pick<Database, "insert" | "select" | "transaction" | "update">;

export type SecondReviewItem = {
	id: string;
	createdAt: string;
	learnerName: string;
	centerName: string;
	taskTitleRw: string;
	taskTitleEn: string;
};

export type SecondReviewDetail = SecondReviewItem & {
	status: SecondStatus;
	note: string | null;
	instructionsRw: string;
	instructionsEn: string;
	learnerNote: string | null;
};

export type ClosedSecondReview = {
	id: string;
	status: SecondOutcome;
};

export type TrainerQuality = {
	userId: number;
	name: string;
	decisions: number;
	approvalRate: number | null;
	reworkRate: number | null;
	medianReviewMinutes: number | null;
	disagreementRate: number | null;
	rejectionReasons: { reason: RejectReason; count: number }[];
};

export type QualityAnomaly =
	| {
			kind: "points_fast";
			userId: number;
			name: string;
			amount: number;
			days: number;
	  }
	| {
			kind: "single_reviewer";
			userId: number;
			name: string;
			reviewerName: string;
			approvals: number;
	  };

export type QualityReport = {
	trainers: TrainerQuality[];
	anomalies: QualityAnomaly[] | null;
};

type SecondSettings = {
	every: number;
	newEvery: number;
	newUntil: number;
	fastDays: number;
	fastAmount: number;
	singleReviewerMin: number;
};

type TaskCopy = {
	titleRw: string;
	titleEn: string;
	instructionsRw: string;
	instructionsEn: string;
};

const learnerUsers = alias(users, "second_review_learner");
const reviewerUsers = alias(users, "second_review_reviewer");

export function isSecondOutcome(value: string): value is SecondOutcome {
	switch (value) {
		case "agreed":
		case "disagreed":
			return true;
		default:
			return false;
	}
}

function isSecondStatus(value: string): value is SecondStatus {
	switch (value) {
		case "open":
		case "agreed":
		case "disagreed":
			return true;
		default:
			return false;
	}
}

/**
 * One approval in every `every` is read again. A trainer with fewer than
 * `newUntil` earlier approvals uses `newEvery`. That step is never larger
 * than `every`, so a new trainer is sampled at least as often. `priorApprovals`
 * does not include the approval just recorded. Zero starts a window, so the
 * first approval of each window is the one that is sampled.
 */
export function shouldSample(input: {
	priorApprovals: number;
	every: number;
	newEvery: number;
	newUntil: number;
}): boolean {
	const every = Math.max(1, input.every);
	const newer = Math.max(1, Math.min(input.newEvery, every));
	const prior = Math.max(0, input.priorApprovals);
	const step = prior < input.newUntil ? newer : every;
	return prior % step === 0;
}

export function percent(part: number, whole: number): number | null {
	if (whole <= 0) return null;
	return Math.round((100 * part) / whole);
}

export function isFastRise(amount: number, limit: number): boolean {
	return amount > limit;
}

export function isSingleReviewer(input: {
	approvals: number;
	reviewers: number;
	minimum: number;
}): boolean {
	return input.approvals >= input.minimum && input.reviewers === 1;
}

export function overseesTrainers(roles: readonly string[]): boolean {
	return roles.some(
		(role) =>
			role === "center_manager" ||
			role === "district_coordinator" ||
			role === "platform_admin",
	);
}

export function summarizeQuality(input: {
	userId: number;
	name: string;
	decisions: readonly {
		decision: VerificationDecision;
		reviewSeconds: number | null;
		reason: RejectReason | null;
	}[];
	secondReviews: readonly SecondOutcome[];
}): TrainerQuality {
	let approved = 0;
	let rework = 0;
	const reasons = new Map<RejectReason, number>();
	const seconds: number[] = [];
	for (const row of input.decisions) {
		switch (row.decision) {
			case "approved":
				approved += 1;
				break;
			case "needs_revision":
				rework += 1;
				break;
			case "rejected":
				if (row.reason) {
					reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);
				}
				break;
			default: {
				const unreachable: never = row.decision;
				return unreachable;
			}
		}
		if (row.reviewSeconds !== null) seconds.push(row.reviewSeconds);
	}
	let disagreed = 0;
	for (const status of input.secondReviews) {
		switch (status) {
			case "agreed":
				break;
			case "disagreed":
				disagreed += 1;
				break;
			default: {
				const unreachable: never = status;
				return unreachable;
			}
		}
	}
	const rejectionReasons = REJECT_REASONS.flatMap((reason) => {
		const count = reasons.get(reason) ?? 0;
		return count > 0 ? [{ reason, count }] : [];
	});
	return {
		userId: input.userId,
		name: input.name,
		decisions: input.decisions.length,
		approvalRate: percent(approved, input.decisions.length),
		reworkRate: percent(rework, input.decisions.length),
		medianReviewMinutes: medianMinutes(seconds),
		disagreementRate: percent(disagreed, input.secondReviews.length),
		rejectionReasons,
	};
}

function wholeInRange(
	value: JsonValue | undefined,
	min: number,
	max: number,
	fallback: number,
): number {
	if (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= min &&
		value <= max
	) {
		return value;
	}
	return fallback;
}

async function readSecondSettings(
	database: Pick<Database, "select">,
): Promise<SecondSettings> {
	const keys = [
		SECOND_EVERY_KEY,
		SECOND_NEW_EVERY_KEY,
		NEW_TRAINER_APPROVALS_KEY,
		FAST_DAYS_KEY,
		FAST_AMOUNT_KEY,
		SINGLE_REVIEWER_KEY,
	];
	const rows = await database
		.select({
			key: configSettings.key,
			version: configSettings.version,
			value: configSettings.value,
		})
		.from(configSettings)
		.where(inArray(configSettings.key, keys));
	const latest = new Map<string, { version: number; value: JsonValue }>();
	for (const row of rows) {
		const current = latest.get(row.key);
		if (!current || row.version >= current.version) latest.set(row.key, row);
	}
	return {
		every: wholeInRange(
			latest.get(SECOND_EVERY_KEY)?.value,
			SECOND_EVERY_MIN,
			SECOND_EVERY_MAX,
			DEFAULT_SECOND_EVERY,
		),
		newEvery: wholeInRange(
			latest.get(SECOND_NEW_EVERY_KEY)?.value,
			SECOND_NEW_EVERY_MIN,
			SECOND_NEW_EVERY_MAX,
			DEFAULT_SECOND_NEW_EVERY,
		),
		newUntil: wholeInRange(
			latest.get(NEW_TRAINER_APPROVALS_KEY)?.value,
			NEW_TRAINER_MIN,
			NEW_TRAINER_MAX,
			DEFAULT_NEW_TRAINER_APPROVALS,
		),
		fastDays: wholeInRange(
			latest.get(FAST_DAYS_KEY)?.value,
			FAST_DAYS_MIN,
			FAST_DAYS_MAX,
			DEFAULT_FAST_DAYS,
		),
		fastAmount: wholeInRange(
			latest.get(FAST_AMOUNT_KEY)?.value,
			FAST_AMOUNT_MIN,
			FAST_AMOUNT_MAX,
			DEFAULT_FAST_AMOUNT,
		),
		singleReviewerMin: wholeInRange(
			latest.get(SINGLE_REVIEWER_KEY)?.value,
			SINGLE_REVIEWER_MIN,
			SINGLE_REVIEWER_MAX,
			DEFAULT_SINGLE_REVIEWER,
		),
	};
}

function cleanNote(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw errors.badRequest("Write the note that goes with this reading.", {
			reason: "note",
		});
	}
	if (trimmed.length > NOTE_LIMIT) {
		throw errors.badRequest("That note is too long.", { reason: "note" });
	}
	return trimmed;
}

function reviewSeconds(
	submittedAt: Date | null,
	decidedAt: Date,
): number | null {
	if (!submittedAt) return null;
	const seconds = (decidedAt.getTime() - submittedAt.getTime()) / 1000;
	if (!Number.isFinite(seconds) || seconds < 0) return null;
	return seconds;
}

/** Sample this approval when the stored rate says so. The award is already kept. */
export async function openSecondReviewIfSampled(
	database: SecondDb,
	input: {
		verificationId: string;
		submissionId: string;
		reviewerId: number;
		ip: string;
	},
): Promise<void> {
	const [countRow] = await database
		.select({ total: sql<number>`count(*)::int` })
		.from(submissionVerifications)
		.where(
			and(
				eq(submissionVerifications.reviewerUserId, input.reviewerId),
				eq(submissionVerifications.decision, "approved"),
				ne(submissionVerifications.id, input.verificationId),
			),
		);
	const settings = await readSecondSettings(database);
	const prior = Number(countRow?.total ?? 0);
	if (
		!shouldSample({
			priorApprovals: prior,
			every: settings.every,
			newEvery: settings.newEvery,
			newUntil: settings.newUntil,
		})
	) {
		return;
	}
	await database.transaction(async (tx) => {
		const inserted = await tx
			.insert(secondReviews)
			.values({
				verificationId: input.verificationId,
				submissionId: input.submissionId,
				firstReviewerUserId: input.reviewerId,
			})
			.onConflictDoNothing({ target: secondReviews.verificationId })
			.returning({ id: secondReviews.id });
		const created = inserted[0];
		if (!created) return;
		await writeAudit(tx, {
			actorId: input.reviewerId,
			action: "second_review.opened",
			targetType: "second_review",
			targetId: created.id,
			ipAddress: input.ip,
			metadata: { submissionId: input.submissionId },
		});
	});
}

async function relationshipsOf(
	database: Pick<Database, "select">,
	userId: number,
) {
	return database
		.select({
			userId: declaredRelationships.userId,
			relatedUserId: declaredRelationships.relatedUserId,
		})
		.from(declaredRelationships)
		.where(
			or(
				eq(declaredRelationships.userId, userId),
				eq(declaredRelationships.relatedUserId, userId),
			),
		);
}

function blockedFromLearner(
	viewerId: number,
	learnerId: number,
	relationships: readonly {
		userId: number;
		relatedUserId: number | null;
	}[],
): boolean {
	return (
		reviewConflict({
			reviewerId: viewerId,
			learnerId,
			relationships,
		}) !== "ok"
	);
}

async function taskCopy(
	database: Pick<Database, "select">,
	taskIds: readonly string[],
): Promise<Map<string, TaskCopy>> {
	const copies = new Map<string, TaskCopy>();
	if (taskIds.length === 0) return copies;
	const rows = await database
		.select({
			taskId: taskTranslations.taskId,
			locale: taskTranslations.locale,
			title: taskTranslations.title,
			instructions: taskTranslations.instructions,
		})
		.from(taskTranslations)
		.where(inArray(taskTranslations.taskId, [...taskIds]));
	for (const row of rows) {
		const current = copies.get(row.taskId) ?? {
			titleRw: "",
			titleEn: "",
			instructionsRw: "",
			instructionsEn: "",
		};
		if (row.locale === "rw") {
			current.titleRw = row.title;
			current.instructionsRw = row.instructions ?? "";
		} else if (row.locale === "en") {
			current.titleEn = row.title;
			current.instructionsEn = row.instructions ?? "";
		}
		copies.set(row.taskId, current);
	}
	return copies;
}

type OpenRow = {
	id: string;
	status: string;
	note: string | null;
	createdAt: Date;
	firstReviewerUserId: number;
	ownerUserId: number;
	centerId: string;
	centerName: string;
	learnerName: string | null;
	learnerNote: string | null;
	taskId: string;
};

async function loadRow(
	database: Pick<Database, "select">,
	reviewId: string,
): Promise<OpenRow | undefined> {
	const [row] = await database
		.select({
			id: secondReviews.id,
			status: secondReviews.status,
			note: secondReviews.note,
			createdAt: secondReviews.createdAt,
			firstReviewerUserId: secondReviews.firstReviewerUserId,
			ownerUserId: taskSubmissions.ownerUserId,
			centerId: enrollments.centerId,
			centerName: learningCenters.name,
			learnerName: users.name,
			learnerNote: taskSubmissions.note,
			taskId: taskSubmissions.taskId,
		})
		.from(secondReviews)
		.innerJoin(
			taskSubmissions,
			eq(taskSubmissions.id, secondReviews.submissionId),
		)
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.innerJoin(learningCenters, eq(learningCenters.id, enrollments.centerId))
		.innerJoin(users, eq(users.id, taskSubmissions.ownerUserId))
		.where(eq(secondReviews.id, reviewId))
		.limit(1);
	return row;
}

async function accessibleRow(
	database: SecondDb,
	input: { reviewerId: number; reviewId: string },
): Promise<OpenRow> {
	const centers = await reviewCenters(database, input.reviewerId);
	const row = await loadRow(database, input.reviewId);
	if (!row || !centers.some((center) => center.id === row.centerId)) {
		throw errors.notFound("That review is not yours to open.");
	}
	if (
		row.firstReviewerUserId === input.reviewerId ||
		row.ownerUserId === input.reviewerId
	) {
		throw errors.notFound("That review is not yours to open.");
	}
	const relationships = await relationshipsOf(database, input.reviewerId);
	if (blockedFromLearner(input.reviewerId, row.ownerUserId, relationships)) {
		throw errors.forbidden("You cannot review a relative.", {
			reason: "relative",
		});
	}
	return row;
}

/** Open second readings at this person's centers, except their own approvals. */
export async function listSecondReviews(
	database: SecondDb,
	input: { reviewerId: number },
): Promise<{ items: SecondReviewItem[] }> {
	const centers = await reviewCenters(database, input.reviewerId);
	const centerIds = centers.map((center) => center.id);
	if (centerIds.length === 0) return { items: [] };
	const rows = await database
		.select({
			id: secondReviews.id,
			createdAt: secondReviews.createdAt,
			firstReviewerUserId: secondReviews.firstReviewerUserId,
			ownerUserId: taskSubmissions.ownerUserId,
			learnerName: users.name,
			centerName: learningCenters.name,
			taskId: taskSubmissions.taskId,
		})
		.from(secondReviews)
		.innerJoin(
			taskSubmissions,
			eq(taskSubmissions.id, secondReviews.submissionId),
		)
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.innerJoin(learningCenters, eq(learningCenters.id, enrollments.centerId))
		.innerJoin(users, eq(users.id, taskSubmissions.ownerUserId))
		.where(
			and(
				eq(secondReviews.status, "open"),
				inArray(enrollments.centerId, centerIds),
				ne(secondReviews.firstReviewerUserId, input.reviewerId),
				ne(taskSubmissions.ownerUserId, input.reviewerId),
			),
		)
		.orderBy(asc(secondReviews.createdAt))
		.limit(LIST_LIMIT);
	const relationships = await relationshipsOf(database, input.reviewerId);
	const visible = rows.filter(
		(row) =>
			!blockedFromLearner(input.reviewerId, row.ownerUserId, relationships),
	);
	const copies = await taskCopy(
		database,
		visible.map((row) => row.taskId),
	);
	return {
		items: visible.map((row) => {
			const copy = copies.get(row.taskId);
			return {
				id: row.id,
				createdAt: row.createdAt.toISOString(),
				learnerName: row.learnerName ?? "",
				centerName: row.centerName,
				taskTitleRw: copy?.titleRw ?? "",
				taskTitleEn: copy?.titleEn ?? "",
			};
		}),
	};
}

export async function readSecondReview(
	database: SecondDb,
	input: { reviewerId: number; reviewId: string },
): Promise<SecondReviewDetail> {
	const row = await accessibleRow(database, input);
	if (!isSecondStatus(row.status)) {
		throw errors.internal("The second review could not be read.");
	}
	const copies = await taskCopy(database, [row.taskId]);
	const copy = copies.get(row.taskId);
	return {
		id: row.id,
		createdAt: row.createdAt.toISOString(),
		learnerName: row.learnerName ?? "",
		centerName: row.centerName,
		taskTitleRw: copy?.titleRw ?? "",
		taskTitleEn: copy?.titleEn ?? "",
		status: row.status,
		note: row.note,
		instructionsRw: copy?.instructionsRw ?? "",
		instructionsEn: copy?.instructionsEn ?? "",
		learnerNote: row.learnerNote,
	};
}

/** Store agreement or disagreement. The original approval stays as it was. */
export async function closeSecondReview(
	database: SecondDb,
	input: {
		reviewerId: number;
		reviewId: string;
		outcome: string;
		note: string;
		ip: string;
	},
): Promise<ClosedSecondReview> {
	if (!isSecondOutcome(input.outcome)) {
		throw errors.badRequest("That reading is not one of the choices.", {
			reason: "outcome",
		});
	}
	const note = cleanNote(input.note);
	const row = await accessibleRow(database, input);
	if (row.status !== "open") {
		throw errors.conflict("This look is already recorded.", {
			reason: "closed",
		});
	}
	const outcome = input.outcome;
	const updated = await database.transaction(async (tx) => {
		const [closed] = await tx
			.update(secondReviews)
			.set({
				status: outcome,
				note,
				secondReviewerUserId: input.reviewerId,
				decidedAt: new Date(),
			})
			.where(
				and(eq(secondReviews.id, row.id), eq(secondReviews.status, "open")),
			)
			.returning({ id: secondReviews.id });
		if (!closed) return null;
		await writeAudit(tx, {
			actorId: input.reviewerId,
			action: "second_review.closed",
			targetType: "second_review",
			targetId: closed.id,
			ipAddress: input.ip,
			metadata: { outcome },
		});
		return closed;
	});
	if (!updated) {
		throw errors.conflict("This look is already recorded.", {
			reason: "closed",
		});
	}
	return { id: updated.id, status: outcome };
}

function centerClause(centerIds: readonly string[] | "all"): SQL | undefined {
	if (centerIds === "all") return undefined;
	return inArray(enrollments.centerId, [...centerIds]);
}

/** Approval, rework, median time, and how often a second look disagrees. */
export async function loadQuality(
	database: SecondDb,
	input: {
		viewerId: number;
		centerIds: readonly string[] | "all";
		selfOnly: boolean;
		anomalies: boolean;
	},
): Promise<QualityReport> {
	if (input.centerIds !== "all" && input.centerIds.length === 0) {
		return { trainers: [], anomalies: input.anomalies ? [] : null };
	}
	const center = centerClause(input.centerIds);
	const self = input.selfOnly
		? eq(submissionVerifications.reviewerUserId, input.viewerId)
		: undefined;
	const decisionWhere = center && self ? and(center, self) : (center ?? self);
	const decisionQuery = database
		.select({
			reviewerId: submissionVerifications.reviewerUserId,
			reviewerName: users.name,
			decision: submissionVerifications.decision,
			reasonCode: submissionVerifications.reasonCode,
			submittedAt: taskSubmissions.submittedAt,
			decidedAt: submissionVerifications.decidedAt,
		})
		.from(submissionVerifications)
		.innerJoin(users, eq(users.id, submissionVerifications.reviewerUserId))
		.innerJoin(
			taskSubmissions,
			eq(taskSubmissions.id, submissionVerifications.submissionId),
		)
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId));
	const decisionRows = decisionWhere
		? await decisionQuery.where(decisionWhere)
		: await decisionQuery;
	const grouped = new Map<
		number,
		{
			name: string;
			decisions: {
				decision: VerificationDecision;
				reviewSeconds: number | null;
				reason: RejectReason | null;
			}[];
			secondReviews: SecondOutcome[];
		}
	>();
	for (const row of decisionRows) {
		if (!isVerificationDecision(row.decision)) continue;
		const current = grouped.get(row.reviewerId) ?? {
			name: row.reviewerName ?? "",
			decisions: [],
			secondReviews: [],
		};
		current.decisions.push({
			decision: row.decision,
			reviewSeconds: reviewSeconds(row.submittedAt, row.decidedAt),
			reason:
				row.reasonCode && isRejectReason(row.reasonCode)
					? row.reasonCode
					: null,
		});
		grouped.set(row.reviewerId, current);
	}
	const reviewerIds = [...grouped.keys()];
	if (reviewerIds.length > 0) {
		const sampleWhere = and(
			inArray(secondReviews.firstReviewerUserId, reviewerIds),
			inArray(secondReviews.status, ["agreed", "disagreed"]),
			center,
		);
		const samples = await database
			.select({
				reviewerId: secondReviews.firstReviewerUserId,
				status: secondReviews.status,
			})
			.from(secondReviews)
			.innerJoin(
				taskSubmissions,
				eq(taskSubmissions.id, secondReviews.submissionId),
			)
			.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
			.where(sampleWhere);
		for (const sample of samples) {
			if (!isSecondOutcome(sample.status)) continue;
			grouped.get(sample.reviewerId)?.secondReviews.push(sample.status);
		}
	}
	const trainers = [...grouped.entries()]
		.map(([userId, row]) =>
			summarizeQuality({
				userId,
				name: row.name,
				decisions: row.decisions,
				secondReviews: row.secondReviews,
			}),
		)
		.sort((left, right) => left.name.localeCompare(right.name));
	if (!input.anomalies) return { trainers, anomalies: null };
	const settings = await readSecondSettings(database);
	return {
		trainers,
		anomalies: await loadAnomalies(database, {
			centerIds: input.centerIds,
			settings,
		}),
	};
}

async function loadAnomalies(
	database: Pick<Database, "select">,
	input: { centerIds: readonly string[] | "all"; settings: SecondSettings },
): Promise<QualityAnomaly[]> {
	const center = centerClause(input.centerIds);
	const enrolledQuery = database
		.select({ userId: enrollments.userId, name: users.name })
		.from(enrollments)
		.innerJoin(users, eq(users.id, enrollments.userId));
	const enrolled = center
		? await enrolledQuery.where(center)
		: await enrolledQuery;
	const names = new Map<number, string>();
	for (const row of enrolled) {
		if (!names.has(row.userId)) names.set(row.userId, row.name ?? "");
	}
	const learnerIds = [...names.keys()];
	const flags: QualityAnomaly[] = [];
	if (learnerIds.length > 0) {
		const cutoff = new Date(Date.now() - input.settings.fastDays * DAY_MS);
		const points = await database
			.select({
				userId: pointTransactions.userId,
				amount: pointTransactions.amount,
			})
			.from(pointTransactions)
			.where(
				and(
					gte(pointTransactions.createdAt, cutoff),
					gt(pointTransactions.amount, 0),
					inArray(pointTransactions.userId, learnerIds),
				),
			);
		const totals = new Map<number, number>();
		for (const row of points) {
			totals.set(row.userId, (totals.get(row.userId) ?? 0) + row.amount);
		}
		const fast = [...totals.entries()]
			.filter(([, amount]) => isFastRise(amount, input.settings.fastAmount))
			.map(([userId, amount]) => ({
				kind: "points_fast" as const,
				userId,
				name: names.get(userId) ?? "",
				amount,
				days: input.settings.fastDays,
			}))
			.sort((left, right) => left.name.localeCompare(right.name))
			.slice(0, ANOMALY_LIMIT);
		flags.push(...fast);
	}
	const approved = eq(submissionVerifications.decision, "approved");
	const approvalWhere = center ? and(approved, center) : approved;
	const approvals = await database
		.select({
			learnerId: taskSubmissions.ownerUserId,
			learnerName: learnerUsers.name,
			reviewerId: submissionVerifications.reviewerUserId,
			reviewerName: reviewerUsers.name,
		})
		.from(submissionVerifications)
		.innerJoin(
			taskSubmissions,
			eq(taskSubmissions.id, submissionVerifications.submissionId),
		)
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.innerJoin(learnerUsers, eq(learnerUsers.id, taskSubmissions.ownerUserId))
		.innerJoin(
			reviewerUsers,
			eq(reviewerUsers.id, submissionVerifications.reviewerUserId),
		)
		.where(approvalWhere);
	const buckets = new Map<
		number,
		{ name: string; reviewers: Map<number, { name: string; count: number }> }
	>();
	for (const row of approvals) {
		const bucket = buckets.get(row.learnerId) ?? {
			name: row.learnerName ?? "",
			reviewers: new Map<number, { name: string; count: number }>(),
		};
		const reviewer = bucket.reviewers.get(row.reviewerId) ?? {
			name: row.reviewerName ?? "",
			count: 0,
		};
		reviewer.count += 1;
		bucket.reviewers.set(row.reviewerId, reviewer);
		buckets.set(row.learnerId, bucket);
	}
	const single = [...buckets.entries()]
		.flatMap(([userId, bucket]) => {
			let approvalsForLearner = 0;
			for (const reviewer of bucket.reviewers.values()) {
				approvalsForLearner += reviewer.count;
			}
			if (
				!isSingleReviewer({
					approvals: approvalsForLearner,
					reviewers: bucket.reviewers.size,
					minimum: input.settings.singleReviewerMin,
				})
			) {
				return [];
			}
			const reviewer = [...bucket.reviewers.values()][0];
			if (!reviewer) return [];
			return [
				{
					kind: "single_reviewer" as const,
					userId,
					name: bucket.name,
					reviewerName: reviewer.name,
					approvals: approvalsForLearner,
				},
			];
		})
		.sort((left, right) => left.name.localeCompare(right.name))
		.slice(0, ANOMALY_LIMIT);
	flags.push(...single);
	return flags;
}
