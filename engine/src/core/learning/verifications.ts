import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { Database } from "../../db";
import {
	declaredRelationships,
	enrollments,
	inPersonChecks,
	rubricCriteria,
	submissionVerifications,
	taskSubmissions,
	verificationScores,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit, writeEvent } from "../audit/write";
import { awardSubmission } from "./award";
import { signAwardedBadge } from "./credentials";
import { type InPersonInput, requiredVisit } from "./in-person";
import { reviewCenters } from "./review-queue";
import { openSecondReviewIfSampled } from "./second-review";

export const REJECT_REASONS = [
	"not_the_task",
	"not_the_learner",
	"unreadable",
	"incomplete",
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number];

export type VerificationDecision = "approved" | "needs_revision" | "rejected";

const NOTE_LIMIT = 2_000;

type VerificationDb = Pick<
	Database,
	"execute" | "insert" | "select" | "transaction" | "update"
>;

export type ScoreInput = {
	criterionId: string;
	score: number;
};

export function isRejectReason(value: string): value is RejectReason {
	switch (value) {
		case "not_the_task":
		case "not_the_learner":
		case "unreadable":
		case "incomplete":
			return true;
		default:
			return false;
	}
}

export function isVerificationDecision(
	value: string,
): value is VerificationDecision {
	switch (value) {
		case "approved":
		case "needs_revision":
		case "rejected":
			return true;
		default:
			return false;
	}
}

/** A trainer cannot decide their own work or a person they have declared. */
export function reviewConflict(input: {
	reviewerId: number;
	learnerId: number;
	relationships: readonly {
		userId: number;
		relatedUserId: number | null;
	}[];
}): "ok" | "self" | "relative" {
	if (input.reviewerId === input.learnerId) return "self";
	const related = input.relationships.some(
		(row) =>
			(row.userId === input.reviewerId &&
				row.relatedUserId === input.learnerId) ||
			(row.userId === input.learnerId &&
				row.relatedUserId === input.reviewerId),
	);
	return related ? "relative" : "ok";
}

/** Weighted percent. Every rubric row is scored once, from 0 to 100. */
export function weightedScore(
	criteria: readonly { id: string; weight: number }[],
	scores: readonly ScoreInput[],
): number | null {
	if (criteria.length === 0) {
		if (scores.length > 0) {
			throw errors.badRequest("That task has no rubric to score.", {
				reason: "score",
			});
		}
		return null;
	}
	const weights = new Map(criteria.map((row) => [row.id, row.weight]));
	const seen = new Set<string>();
	let weighted = 0;
	let weight = 0;
	for (const score of scores) {
		const criterionWeight = weights.get(score.criterionId);
		if (criterionWeight === undefined || seen.has(score.criterionId)) {
			throw errors.badRequest("Score each part of the rubric once.", {
				reason: "score",
			});
		}
		if (
			!Number.isInteger(score.score) ||
			score.score < 0 ||
			score.score > 100
		) {
			throw errors.badRequest("Enter a score from 0 to 100.", {
				reason: "score",
			});
		}
		seen.add(score.criterionId);
		weighted += score.score * criterionWeight;
		weight += criterionWeight;
	}
	if (seen.size !== criteria.length) {
		throw errors.badRequest("Score each part of the rubric once.", {
			reason: "score",
		});
	}
	return Math.round(weighted / weight);
}

function cleanNote(
	value: string | undefined,
	reason: "feedback" | "note",
): string {
	const trimmed = value?.trim() ?? "";
	if (!trimmed) {
		throw errors.badRequest(
			reason === "feedback"
				? "Write what the learner should change."
				: "Write the note that goes with this reason.",
			{ reason },
		);
	}
	if (trimmed.length > NOTE_LIMIT) {
		throw errors.badRequest("That note is too long.", { reason });
	}
	return trimmed;
}

/** The latest note a learner can read beside an attempt. */
export async function feedbackForSubmissions(
	database: Pick<Database, "select">,
	submissionIds: readonly string[],
): Promise<Map<string, string>> {
	const notes = new Map<string, string>();
	if (submissionIds.length === 0) return notes;
	const rows = await database
		.select({
			submissionId: submissionVerifications.submissionId,
			note: submissionVerifications.note,
		})
		.from(submissionVerifications)
		.where(inArray(submissionVerifications.submissionId, [...submissionIds]))
		.orderBy(desc(submissionVerifications.decidedAt));
	for (const row of rows) {
		if (!notes.has(row.submissionId)) notes.set(row.submissionId, row.note);
	}
	return notes;
}

export type VerificationResult = {
	id: string;
	submissionId: string;
	decision: VerificationDecision;
	scoreTotal: number | null;
	points: number;
	verifiedMinutes: number;
	badgeId: string | null;
};

/**
 * Record a decision. Approval calls `award_submission` once, so the
 * verification, points, hours, and badge commit together.
 */
export async function createVerification(
	database: VerificationDb,
	input: {
		reviewerId: number;
		submissionId: string;
		decision: string;
		note?: string;
		reasonCode?: string;
		scores?: ScoreInput[];
		inPerson?: InPersonInput;
		idempotencyKey?: string;
		ip: string;
	},
): Promise<VerificationResult> {
	if (!isVerificationDecision(input.decision)) {
		throw errors.badRequest("That decision is not one of the choices.", {
			reason: "decision",
		});
	}
	const centers = await reviewCenters(database, input.reviewerId);
	const [row] = await database
		.select({
			id: taskSubmissions.id,
			status: taskSubmissions.status,
			taskId: taskSubmissions.taskId,
			ownerUserId: taskSubmissions.ownerUserId,
			centerId: enrollments.centerId,
			contentVersionId: taskSubmissions.contentVersionId,
		})
		.from(taskSubmissions)
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.where(eq(taskSubmissions.id, input.submissionId))
		.limit(1);
	if (!row || !centers.some((center) => center.id === row.centerId)) {
		throw errors.notFound("That submission was not found.");
	}
	const relationships = await database
		.select({
			userId: declaredRelationships.userId,
			relatedUserId: declaredRelationships.relatedUserId,
		})
		.from(declaredRelationships)
		.where(
			or(
				and(
					eq(declaredRelationships.userId, input.reviewerId),
					eq(declaredRelationships.relatedUserId, row.ownerUserId),
				),
				and(
					eq(declaredRelationships.userId, row.ownerUserId),
					eq(declaredRelationships.relatedUserId, input.reviewerId),
				),
			),
		);
	const conflict = reviewConflict({
		reviewerId: input.reviewerId,
		learnerId: row.ownerUserId,
		relationships,
	});
	if (conflict === "self") {
		throw errors.forbidden("You cannot review your own work.", {
			reason: "self",
		});
	}
	if (conflict === "relative") {
		throw errors.forbidden("You cannot review a relative.", {
			reason: "relative",
		});
	}
	if (
		input.decision !== "approved" &&
		row.status !== "pending" &&
		row.status !== "in_review"
	) {
		throw errors.conflict("This attempt is no longer waiting.", {
			reason: "closed",
		});
	}
	const decision = input.decision;
	const note = cleanNote(
		input.note,
		decision === "needs_revision" ? "feedback" : "note",
	);
	let reasonCode: RejectReason | null = null;
	if (decision === "rejected") {
		if (!input.reasonCode || !isRejectReason(input.reasonCode)) {
			throw errors.badRequest("Choose the reason for rejecting this.", {
				reason: "reason",
			});
		}
		reasonCode = input.reasonCode;
	} else if (input.reasonCode) {
		throw errors.badRequest("A reason is only used when rejecting.", {
			reason: "reason",
		});
	}
	const criteria = await database
		.select({ id: rubricCriteria.id, weight: rubricCriteria.weight })
		.from(rubricCriteria)
		.where(eq(rubricCriteria.taskId, row.taskId));
	const scoreTotal = weightedScore(criteria, input.scores ?? []);
	const scores = input.scores ?? [];
	const now = new Date();
	const visit = await requiredVisit(database, {
		contentVersionId: row.contentVersionId,
		decision,
		inPerson: input.inPerson,
		now,
	});
	if (decision === "approved") {
		const key = input.idempotencyKey?.trim() ?? "";
		if (!key) {
			throw errors.badRequest("This approval needs an idempotency key.", {
				reason: "key",
			});
		}
		return database.transaction(async (tx) => {
			const awarded = await awardSubmission(tx, {
				reviewerId: input.reviewerId,
				submissionId: row.id,
				note,
				scores,
				idempotencyKey: key,
				ip: input.ip,
			});
			if (visit) {
				const [check] = await tx
					.insert(inPersonChecks)
					.values({
						verificationId: awarded.id,
						submissionId: awarded.submissionId,
						reviewerUserId: input.reviewerId,
						location: visit.location,
						observedAt: visit.observedAt,
						recordedAt: now,
					})
					.returning({ id: inPersonChecks.id });
				if (!check) throw errors.internal("The visit was not stored.");
				await writeAudit(tx, {
					actorId: input.reviewerId,
					action: "verification.in_person",
					targetType: "in_person_check",
					targetId: check.id,
					ipAddress: input.ip,
					metadata: { submissionId: awarded.submissionId },
				});
			}
			await openSecondReviewIfSampled(tx, {
				verificationId: awarded.id,
				submissionId: awarded.submissionId,
				reviewerId: input.reviewerId,
				ip: input.ip,
			});
			if (awarded.badgeId) {
				await signAwardedBadge(tx, {
					verificationId: awarded.id,
					ip: input.ip,
				});
			}
			return awarded;
		});
	}

	return database.transaction(async (tx) => {
		const [updated] = await tx
			.update(taskSubmissions)
			.set({ status: decision })
			.where(
				and(
					eq(taskSubmissions.id, row.id),
					inArray(taskSubmissions.status, ["pending", "in_review"]),
				),
			)
			.returning({ id: taskSubmissions.id });
		if (!updated) {
			throw errors.conflict("This attempt is no longer waiting.", {
				reason: "closed",
			});
		}
		const [created] = await tx
			.insert(submissionVerifications)
			.values({
				submissionId: row.id,
				reviewerUserId: input.reviewerId,
				decision,
				note,
				reasonCode,
				scoreTotal,
			})
			.returning({ id: submissionVerifications.id });
		if (!created) throw errors.internal("The decision could not be stored.");
		if (scores.length > 0) {
			await tx.insert(verificationScores).values(
				scores.map((score) => ({
					verificationId: created.id,
					criterionId: score.criterionId,
					score: score.score,
				})),
			);
		}
		await writeAudit(tx, {
			actorId: input.reviewerId,
			action: "verification.created",
			targetType: "submission_verification",
			targetId: created.id,
			ipAddress: input.ip,
			metadata: {
				submissionId: row.id,
				decision,
				reasonCode,
				scoreTotal,
			},
		});
		await writeEvent(tx, {
			name:
				decision === "needs_revision"
					? "submission.needs_revision"
					: "submission.rejected",
			payload: {
				submissionId: row.id,
				verificationId: created.id,
				decision,
			},
		});
		return {
			id: created.id,
			submissionId: row.id,
			decision,
			scoreTotal,
			points: 0,
			verifiedMinutes: 0,
			badgeId: null,
		};
	});
}
