import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	centerStaff,
	declaredRelationships,
	districts,
	domainEvents,
	followUpEvidence,
	followUpReviews,
	followUps,
	followUpVerifications,
	hardwareGrants,
	learningCenters,
	mediaObjects,
	sectors,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit, writeEvent } from "../audit/write";
import { createBlock, type SubmissionStatus } from "../learning/submissions";
import { reviewConflict } from "../learning/verifications";

/** The check-in days named in the follow-up requirement. */
export const FOLLOW_UP_DAYS = [30, 90, 180] as const;

export type FollowUpDay = (typeof FOLLOW_UP_DAYS)[number];

type FollowDb = Database;

export type FollowUpRow = {
	id: string;
	day: FollowUpDay;
	dueOn: string;
	response: "waiting" | "answered" | "unresponsive";
	asked: boolean;
	inUse: boolean | null;
	purpose: string | null;
	evidenceStatus: "pending" | "approved" | "needs_revision" | "rejected" | null;
};

export type EvidenceQueueRow = {
	evidenceId: string;
	followUpId: string;
	day: FollowUpDay;
	note: string;
	recipientName: string;
	centerName: string;
};

export type ReviewQueueRow = {
	reviewId: string;
	followUpId: string;
	day: FollowUpDay;
	recipientName: string;
	districtName: string;
	open: boolean;
};

function isDay(value: number): value is FollowUpDay {
	return value === 30 || value === 90 || value === 180;
}

function asResponse(value: string): "waiting" | "answered" | "unresponsive" {
	if (value === "answered" || value === "unresponsive") return value;
	return "waiting";
}

function asEvidenceStatus(value: string | null): FollowUpRow["evidenceStatus"] {
	if (
		value === "pending" ||
		value === "approved" ||
		value === "needs_revision" ||
		value === "rejected"
	) {
		return value;
	}
	return null;
}

/** Calendar addition that stays on the UTC date, with no time of day. */
export function addDays(isoDate: string, days: number): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
	if (!match) {
		throw errors.badRequest("The award date is missing.", { reason: "date" });
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const utc = new Date(Date.UTC(year, month - 1, day));
	utc.setUTCDate(utc.getUTCDate() + days);
	return utc.toISOString().slice(0, 10);
}

function cleanText(value: string, reason: string): string {
	const text = value.trim();
	if (text.length < 1 || text.length > 400) {
		throw errors.badRequest("Write a short note.", { reason });
	}
	return text;
}

async function scheduleGrant(
	database: FollowDb,
	grantId: string,
	awardedOn: string,
): Promise<void> {
	const existing = await database
		.select({ day: followUps.day })
		.from(followUps)
		.where(eq(followUps.grantId, grantId));
	const have = new Set(existing.map((row) => row.day));
	const missing = FOLLOW_UP_DAYS.filter((day) => !have.has(day));
	if (missing.length === 0) return;
	await database.insert(followUps).values(
		missing.map((day) => ({
			grantId,
			day,
			dueOn: addDays(awardedOn, day),
		})),
	);
}

/** Create the three check-ins for every grant that does not have them yet. */
export async function scheduleMissing(database: FollowDb): Promise<void> {
	const grants = await database
		.select({ id: hardwareGrants.id, awardedOn: hardwareGrants.awardedOn })
		.from(hardwareGrants)
		.where(
			sql`not exists (
				select 1 from follow_ups
				where follow_ups.grant_id = ${hardwareGrants.id}
				and follow_ups.day = 30
			)`,
		);
	for (const grant of grants) {
		await scheduleGrant(database, grant.id, grant.awardedOn);
	}
}

async function openSilence(
	database: FollowDb,
	sweepStart: Date,
): Promise<void> {
	const waiting = await database
		.select({
			id: followUps.id,
			grantId: followUps.grantId,
			day: followUps.day,
			askedAt: followUps.askedAt,
		})
		.from(followUps)
		.where(
			and(
				eq(followUps.response, "waiting"),
				sql`${followUps.askedAt} is not null`,
			),
		);
	const silent = waiting.filter(
		(row) =>
			row.askedAt !== null && row.askedAt.getTime() < sweepStart.getTime(),
	);
	for (const row of silent) {
		const askedLater = await database
			.select({ id: followUps.id })
			.from(followUps)
			.where(
				and(
					eq(followUps.grantId, row.grantId),
					sql`${followUps.day} > ${row.day}`,
					sql`${followUps.askedAt} is not null`,
				),
			)
			.limit(1);
		if (askedLater.length === 0) continue;
		const updated = await database
			.update(followUps)
			.set({ response: "unresponsive" })
			.where(and(eq(followUps.id, row.id), eq(followUps.response, "waiting")))
			.returning({ id: followUps.id });
		if (updated.length === 0) continue;
		await database
			.insert(followUpReviews)
			.values({ followUpId: row.id })
			.onConflictDoNothing();
		const [grant] = await database
			.select({ userId: hardwareGrants.recipientUserId })
			.from(hardwareGrants)
			.where(eq(hardwareGrants.id, row.grantId))
			.limit(1);
		if (!grant) continue;
		await writeAudit(database, {
			action: "follow_up.unresponsive",
			targetType: "follow_up",
			targetId: row.id,
			metadata: { grantId: row.grantId, userId: grant.userId },
		});
	}
}

/**
 * Ask every check-in whose date has arrived. A check-in that was already
 * asked, and is still unanswered when a later one is asked, opens a review.
 */
export async function askDueFollowUps(database: FollowDb): Promise<number> {
	await scheduleMissing(database);
	const sweepStart = new Date();
	const due = await database
		.select({
			id: followUps.id,
			day: followUps.day,
			userId: hardwareGrants.recipientUserId,
		})
		.from(followUps)
		.innerJoin(hardwareGrants, eq(hardwareGrants.id, followUps.grantId))
		.where(
			and(isNull(followUps.askedAt), sql`${followUps.dueOn} <= current_date`),
		)
		.orderBy(asc(followUps.day));
	for (const row of due) {
		await database.transaction(async (tx) => {
			const updated = await tx
				.update(followUps)
				.set({ askedAt: new Date() })
				.where(and(eq(followUps.id, row.id), isNull(followUps.askedAt)))
				.returning({ id: followUps.id });
			if (updated.length === 0) return;
			await writeEvent(tx, {
				name: "follow_up.due",
				payload: { userId: row.userId, followUpId: row.id, day: row.day },
			});
		});
	}
	await openSilence(database, sweepStart);
	return due.length;
}

async function ownRows(
	database: FollowDb,
	userId: number,
): Promise<FollowUpRow[]> {
	const grants = await database
		.select({ id: hardwareGrants.id, awardedOn: hardwareGrants.awardedOn })
		.from(hardwareGrants)
		.where(eq(hardwareGrants.recipientUserId, userId));
	for (const grant of grants) {
		await scheduleGrant(database, grant.id, grant.awardedOn);
	}
	const rows = await database
		.select({
			id: followUps.id,
			day: followUps.day,
			dueOn: followUps.dueOn,
			response: followUps.response,
			askedAt: followUps.askedAt,
			inUse: followUps.inUse,
			purpose: followUps.purpose,
			evidenceStatus: followUpEvidence.status,
			evidenceAt: followUpEvidence.createdAt,
		})
		.from(followUps)
		.innerJoin(hardwareGrants, eq(hardwareGrants.id, followUps.grantId))
		.leftJoin(followUpEvidence, eq(followUpEvidence.followUpId, followUps.id))
		.where(eq(hardwareGrants.recipientUserId, userId))
		.orderBy(asc(followUps.dueOn), desc(followUpEvidence.createdAt));
	const seen = new Set<string>();
	const result: FollowUpRow[] = [];
	for (const row of rows) {
		if (seen.has(row.id) || !isDay(row.day)) continue;
		seen.add(row.id);
		result.push({
			id: row.id,
			day: row.day,
			dueOn: row.dueOn,
			response: asResponse(row.response),
			asked: row.askedAt !== null,
			inUse: row.inUse,
			purpose: row.purpose,
			evidenceStatus: asEvidenceStatus(row.evidenceStatus),
		});
	}
	return result;
}

/** The signed-in recipient's check-ins. Other people's rows are not included. */
export async function listOwnFollowUps(
	database: FollowDb,
	userId: number,
): Promise<FollowUpRow[]> {
	return ownRows(database, userId);
}

export async function readOwnFollowUp(
	database: FollowDb,
	input: { userId: number; followUpId: string },
): Promise<FollowUpRow> {
	const rows = await ownRows(database, input.userId);
	const row = rows.find((item) => item.id === input.followUpId);
	if (!row) throw errors.notFound("That follow-up was not found.");
	return row;
}

/** The recipient says whether the device is in use, and for what. */
export async function answerFollowUp(
	database: FollowDb,
	input: {
		followUpId: string;
		actorId: number;
		inUse: boolean;
		purpose?: string;
		ip: string;
	},
): Promise<{ id: string }> {
	const purpose = input.inUse
		? cleanText(input.purpose ?? "", "purpose")
		: null;
	const updated = await database
		.update(followUps)
		.set({
			response: "answered",
			inUse: input.inUse,
			purpose,
			answeredAt: new Date(),
		})
		.where(
			and(
				eq(followUps.id, input.followUpId),
				eq(followUps.response, "waiting"),
				sql`${followUps.askedAt} is not null`,
				sql`exists (
					select 1 from hardware_grants
					where hardware_grants.id = ${followUps.grantId}
					and hardware_grants.recipient_user_id = ${input.actorId}
				)`,
			),
		)
		.returning({ id: followUps.id, grantId: followUps.grantId });
	if (updated.length === 0) {
		const [row] = await database
			.select({
				id: followUps.id,
				response: followUps.response,
				askedAt: followUps.askedAt,
				recipientId: hardwareGrants.recipientUserId,
			})
			.from(followUps)
			.innerJoin(hardwareGrants, eq(hardwareGrants.id, followUps.grantId))
			.where(eq(followUps.id, input.followUpId))
			.limit(1);
		if (!row) throw errors.notFound("That follow-up was not found.");
		if (row.recipientId !== input.actorId) {
			throw errors.forbidden("The recipient answers this check-in.", {
				reason: "self",
			});
		}
		if (row.askedAt === null) {
			throw errors.conflict("This check-in is not due yet.", {
				reason: "early",
			});
		}
		throw errors.conflict("This check-in already has an answer.", {
			reason: "closed",
		});
	}
	const saved = updated[0];
	if (!saved) throw errors.notFound("That follow-up was not found.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "follow_up.answered",
		targetType: "follow_up",
		targetId: saved.id,
		ipAddress: input.ip,
		metadata: { grantId: saved.grantId },
	});
	return { id: saved.id };
}

async function readyImage(
	database: FollowDb,
	mediaId: string,
	ownerId: number,
): Promise<void> {
	const [row] = await database
		.select({
			ownerUserId: mediaObjects.ownerUserId,
			contentType: mediaObjects.contentType,
			status: mediaObjects.status,
		})
		.from(mediaObjects)
		.where(eq(mediaObjects.id, mediaId))
		.limit(1);
	if (!row || row.ownerUserId !== ownerId) {
		throw errors.notFound("That file was not found.");
	}
	if (!row.contentType.startsWith("image/") || row.status !== "ready") {
		throw errors.conflict(
			"The photo has to be an image that finished uploading.",
			{
				reason: "photo",
			},
		);
	}
}

/** Optional photo of the device in use. It waits for the same kind of decision as a task. */
export async function submitFollowUpEvidence(
	database: FollowDb,
	input: {
		followUpId: string;
		actorId: number;
		mediaId: string;
		note: string;
		ip: string;
	},
): Promise<{ id: string }> {
	const note = cleanText(input.note, "note");
	const [follow] = await database
		.select({
			id: followUps.id,
			askedAt: followUps.askedAt,
			recipientId: hardwareGrants.recipientUserId,
			grantId: followUps.grantId,
		})
		.from(followUps)
		.innerJoin(hardwareGrants, eq(hardwareGrants.id, followUps.grantId))
		.where(eq(followUps.id, input.followUpId))
		.limit(1);
	if (!follow) throw errors.notFound("That follow-up was not found.");
	if (follow.recipientId !== input.actorId) {
		throw errors.forbidden("The recipient sends this evidence.", {
			reason: "self",
		});
	}
	if (follow.askedAt === null) {
		throw errors.conflict("This check-in is not due yet.", { reason: "early" });
	}
	await readyImage(database, input.mediaId, input.actorId);
	const previous = await database
		.select({ status: followUpEvidence.status })
		.from(followUpEvidence)
		.where(eq(followUpEvidence.followUpId, follow.id));
	const block = createBlock(
		previous.map((row) => row.status as SubmissionStatus),
	);
	if (block === "open") {
		throw errors.conflict("This evidence is already waiting for review.", {
			reason: "duplicate",
		});
	}
	if (block === "closed") {
		throw errors.conflict("This evidence already has a decision.", {
			reason: "closed",
		});
	}
	if (block === "limit") {
		throw errors.conflict("This evidence has no tries left.", {
			reason: "attempts",
		});
	}
	const [created] = await database
		.insert(followUpEvidence)
		.values({
			followUpId: follow.id,
			mediaObjectId: input.mediaId,
			note,
			submittedByUserId: input.actorId,
		})
		.returning({ id: followUpEvidence.id });
	if (!created) throw errors.internal("The evidence was not stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "follow_up.evidence_submitted",
		targetType: "follow_up",
		targetId: follow.id,
		ipAddress: input.ip,
		metadata: { grantId: follow.grantId },
	});
	return { id: created.id };
}

async function conflictKind(
	database: FollowDb,
	actorId: number,
	learnerId: number,
): Promise<"ok" | "self" | "relative"> {
	const relationships = await database
		.select({
			userId: declaredRelationships.userId,
			relatedUserId: declaredRelationships.relatedUserId,
		})
		.from(declaredRelationships)
		.where(
			sql`${declaredRelationships.userId} = ${actorId} or ${declaredRelationships.relatedUserId} = ${actorId}`,
		);
	return reviewConflict({
		reviewerId: actorId,
		learnerId,
		relationships,
	});
}

/** A trainer at the recipient's center decides the usage evidence. */
export async function reviewFollowUpEvidence(
	database: FollowDb,
	input: {
		evidenceId: string;
		actorId: number;
		decision: "approved" | "needs_revision" | "rejected";
		note: string;
		ip: string;
	},
): Promise<{ id: string }> {
	const note = cleanText(input.note, "note");
	const [evidence] = await database
		.select({
			id: followUpEvidence.id,
			status: followUpEvidence.status,
			followUpId: followUpEvidence.followUpId,
			recipientId: hardwareGrants.recipientUserId,
			centerId: users.centerId,
			grantId: hardwareGrants.id,
		})
		.from(followUpEvidence)
		.innerJoin(followUps, eq(followUps.id, followUpEvidence.followUpId))
		.innerJoin(hardwareGrants, eq(hardwareGrants.id, followUps.grantId))
		.innerJoin(users, eq(users.id, hardwareGrants.recipientUserId))
		.where(eq(followUpEvidence.id, input.evidenceId))
		.limit(1);
	if (!evidence) throw errors.notFound("That evidence was not found.");
	if (evidence.status !== "pending") {
		throw errors.conflict("This evidence already has a decision.", {
			reason: "closed",
		});
	}
	const conflict = await conflictKind(
		database,
		input.actorId,
		evidence.recipientId,
	);
	if (conflict === "self") {
		throw errors.forbidden("You cannot review your own evidence.", {
			reason: "self",
		});
	}
	if (conflict === "relative") {
		throw errors.forbidden("You cannot review a relative.", {
			reason: "relative",
		});
	}
	if (!evidence.centerId) {
		throw errors.conflict("This learner has no center.", { reason: "center" });
	}
	const [staff] = await database
		.select({ id: centerStaff.id })
		.from(centerStaff)
		.where(
			and(
				eq(centerStaff.centerId, evidence.centerId),
				eq(centerStaff.userId, input.actorId),
				inArray(centerStaff.role, ["trainer", "center_manager"]),
			),
		)
		.limit(1);
	if (!staff) {
		throw errors.forbidden("A trainer at the learner's center reviews this.", {
			reason: "center",
		});
	}
	const [decision] = await database
		.insert(followUpVerifications)
		.values({
			evidenceId: evidence.id,
			reviewerUserId: input.actorId,
			decision: input.decision,
			note,
		})
		.returning({ id: followUpVerifications.id });
	if (!decision) throw errors.internal("The decision was not stored.");
	await database
		.update(followUpEvidence)
		.set({ status: input.decision })
		.where(
			and(
				eq(followUpEvidence.id, evidence.id),
				eq(followUpEvidence.status, "pending"),
			),
		);
	await writeAudit(database, {
		actorId: input.actorId,
		action: "follow_up.reviewed",
		targetType: "follow_up",
		targetId: evidence.followUpId,
		ipAddress: input.ip,
		metadata: { grantId: evidence.grantId, decision: input.decision },
	});
	return { id: decision.id };
}

export async function listEvidenceQueue(
	database: FollowDb,
	centerIds: readonly string[] | null,
): Promise<EvidenceQueueRow[]> {
	if (centerIds !== null && centerIds.length === 0) return [];
	const rows = await database
		.select({
			evidenceId: followUpEvidence.id,
			followUpId: followUpEvidence.followUpId,
			day: followUps.day,
			note: followUpEvidence.note,
			recipientName: users.name,
			centerName: learningCenters.name,
		})
		.from(followUpEvidence)
		.innerJoin(followUps, eq(followUps.id, followUpEvidence.followUpId))
		.innerJoin(hardwareGrants, eq(hardwareGrants.id, followUps.grantId))
		.innerJoin(users, eq(users.id, hardwareGrants.recipientUserId))
		.innerJoin(learningCenters, eq(learningCenters.id, users.centerId))
		.where(
			and(
				eq(followUpEvidence.status, "pending"),
				centerIds === null
					? undefined
					: inArray(learningCenters.id, [...centerIds]),
			),
		)
		.orderBy(asc(followUpEvidence.createdAt));
	return rows.flatMap((row) => {
		if (!isDay(row.day)) return [];
		return [
			{
				evidenceId: row.evidenceId,
				followUpId: row.followUpId,
				day: row.day,
				note: row.note,
				recipientName: row.recipientName ?? "",
				centerName: row.centerName,
			},
		];
	});
}

export async function listReviewQueue(
	database: FollowDb,
	districtIds: readonly string[] | null,
): Promise<ReviewQueueRow[]> {
	const rows = await database
		.select({
			reviewId: followUpReviews.id,
			followUpId: followUpReviews.followUpId,
			day: followUps.day,
			recipientName: users.name,
			districtName: districts.name,
			districtId: districts.id,
			closedAt: followUpReviews.closedAt,
		})
		.from(followUpReviews)
		.innerJoin(followUps, eq(followUps.id, followUpReviews.followUpId))
		.innerJoin(hardwareGrants, eq(hardwareGrants.id, followUps.grantId))
		.innerJoin(users, eq(users.id, hardwareGrants.recipientUserId))
		.innerJoin(learningCenters, eq(learningCenters.id, users.centerId))
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.innerJoin(districts, eq(districts.id, sectors.districtId))
		.orderBy(desc(followUpReviews.openedAt));
	return rows.flatMap((row) => {
		if (!isDay(row.day)) return [];
		if (districtIds !== null && !districtIds.includes(row.districtId))
			return [];
		return [
			{
				reviewId: row.reviewId,
				followUpId: row.followUpId,
				day: row.day,
				recipientName: row.recipientName ?? "",
				districtName: row.districtName,
				open: row.closedAt === null,
			},
		];
	});
}

/** The last milestone can be marked unanswered. Earlier ones open on their own. */
export async function recordSilence(
	database: FollowDb,
	input: { followUpId: string; actorId: number; ip: string },
): Promise<{ id: string }> {
	const [row] = await database
		.select({
			id: followUps.id,
			day: followUps.day,
			response: followUps.response,
			askedAt: followUps.askedAt,
			grantId: followUps.grantId,
		})
		.from(followUps)
		.where(eq(followUps.id, input.followUpId))
		.limit(1);
	if (!row) throw errors.notFound("That follow-up was not found.");
	if (row.day !== 180 || row.askedAt === null) {
		throw errors.conflict("This check-in is not ready for a review.", {
			reason: "early",
		});
	}
	if (row.response !== "waiting") {
		throw errors.conflict("This check-in already has an answer.", {
			reason: "closed",
		});
	}
	const updated = await database
		.update(followUps)
		.set({ response: "unresponsive" })
		.where(and(eq(followUps.id, row.id), eq(followUps.response, "waiting")))
		.returning({ id: followUps.id });
	if (updated.length === 0) {
		throw errors.conflict("This check-in already has an answer.", {
			reason: "closed",
		});
	}
	const [review] = await database
		.insert(followUpReviews)
		.values({ followUpId: row.id })
		.onConflictDoNothing()
		.returning({ id: followUpReviews.id });
	await writeAudit(database, {
		actorId: input.actorId,
		action: "follow_up.unresponsive",
		targetType: "follow_up",
		targetId: row.id,
		ipAddress: input.ip,
		metadata: { grantId: row.grantId },
	});
	return { id: review?.id ?? row.id };
}

/** Close the review that silence opened. The note is required. */
export async function closeFollowUpReview(
	database: FollowDb,
	input: { reviewId: string; actorId: number; note: string; ip: string },
): Promise<{ id: string }> {
	const note = cleanText(input.note, "note");
	const updated = await database
		.update(followUpReviews)
		.set({ closedAt: new Date(), closedByUserId: input.actorId, note })
		.where(
			and(
				eq(followUpReviews.id, input.reviewId),
				isNull(followUpReviews.closedAt),
			),
		)
		.returning({
			id: followUpReviews.id,
			followUpId: followUpReviews.followUpId,
		});
	if (updated.length === 0) {
		const [row] = await database
			.select({ id: followUpReviews.id })
			.from(followUpReviews)
			.where(eq(followUpReviews.id, input.reviewId))
			.limit(1);
		if (!row) throw errors.notFound("That review was not found.");
		throw errors.conflict("This review is already closed.", {
			reason: "closed",
		});
	}
	const saved = updated[0];
	if (!saved) throw errors.notFound("That review was not found.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "follow_up.review_closed",
		targetType: "follow_up",
		targetId: saved.followUpId,
		ipAddress: input.ip,
		metadata: { reviewId: saved.id },
	});
	return { id: saved.id };
}

/** How many follow-up events are waiting. Tests read this count. */
export async function dueEventCount(
	database: FollowDb,
	followUpId: string,
): Promise<number> {
	const rows = await database
		.select({ id: domainEvents.id })
		.from(domainEvents)
		.where(
			sql`${domainEvents.name} = 'follow_up.due' and ${domainEvents.payload}->>'followUpId' = ${followUpId}`,
		);
	return rows.length;
}
