import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import type { Database } from "../../db";
import {
	appeals,
	declaredRelationships,
	enrollments,
	learningCenters,
	submissionVerifications,
	taskSubmissions,
	taskTranslations,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { reviewCenters } from "./review-queue";
import { reviewConflict } from "./verifications";

const NOTE_LIMIT = 500;
const LIST_LIMIT = 50;

const APPEAL_OUTCOMES = ["upheld", "overturned"] as const;
export type AppealOutcome = (typeof APPEAL_OUTCOMES)[number];
export type AppealStatus = "open" | AppealOutcome;

type AppealDb = Pick<Database, "insert" | "select" | "transaction" | "update">;

export type AppealItem = {
	id: string;
	createdAt: string;
	learnerName: string;
	centerName: string;
	taskTitleRw: string;
	taskTitleEn: string;
};

export type AppealDetail = AppealItem & {
	status: AppealStatus;
	note: string;
	decisionNote: string | null;
	rejectionNote: string;
	reasonCode: string | null;
	instructionsRw: string;
	instructionsEn: string;
};

export type ClosedAppeal = {
	id: string;
	status: AppealOutcome;
};

export function isAppealOutcome(value: string): value is AppealOutcome {
	switch (value) {
		case "upheld":
		case "overturned":
			return true;
		default:
			return false;
	}
}

function isAppealStatus(value: string): value is AppealStatus {
	switch (value) {
		case "open":
		case "upheld":
		case "overturned":
			return true;
		default:
			return false;
	}
}

function cleanNote(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw errors.badRequest("Write the note that goes with this appeal.", {
			reason: "note",
		});
	}
	if (trimmed.length > NOTE_LIMIT) {
		throw errors.badRequest("That note is too long.", { reason: "note" });
	}
	return trimmed;
}

/** The learner asks once about a rejection. The rejection row is not edited. */
export async function fileAppeal(
	database: AppealDb,
	input: { learnerId: number; submissionId: string; note: string; ip: string },
): Promise<{ id: string; status: "open" }> {
	const note = cleanNote(input.note);
	const [row] = await database
		.select({
			submissionId: taskSubmissions.id,
			status: taskSubmissions.status,
			ownerUserId: taskSubmissions.ownerUserId,
			verificationId: submissionVerifications.id,
			decision: submissionVerifications.decision,
			reviewerUserId: submissionVerifications.reviewerUserId,
		})
		.from(taskSubmissions)
		.innerJoin(
			submissionVerifications,
			eq(submissionVerifications.submissionId, taskSubmissions.id),
		)
		.where(eq(taskSubmissions.id, input.submissionId))
		.limit(1);
	if (!row || row.ownerUserId !== input.learnerId) {
		throw errors.notFound("That submission was not found.");
	}
	if (row.status !== "rejected" || row.decision !== "rejected") {
		throw errors.conflict("Only a rejection can be appealed.", {
			reason: "closed",
		});
	}
	const [existing] = await database
		.select({ id: appeals.id })
		.from(appeals)
		.where(eq(appeals.submissionId, row.submissionId))
		.limit(1);
	if (existing) {
		throw errors.conflict("This rejection already has an appeal.", {
			reason: "once",
		});
	}
	const [created] = await database
		.insert(appeals)
		.values({
			submissionId: row.submissionId,
			verificationId: row.verificationId,
			learnerUserId: input.learnerId,
			firstReviewerUserId: row.reviewerUserId,
			note,
		})
		.returning({ id: appeals.id });
	if (!created) throw errors.internal("The appeal could not be stored.");
	await writeAudit(database, {
		actorId: input.learnerId,
		action: "appeal.opened",
		targetType: "appeal",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: { submissionId: row.submissionId },
	});
	return { id: created.id, status: "open" };
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

type AppealRow = {
	id: string;
	status: string;
	note: string;
	decisionNote: string | null;
	createdAt: Date;
	learnerUserId: number;
	firstReviewerUserId: number;
	ownerUserId: number;
	centerId: string;
	centerName: string;
	learnerName: string | null;
	taskId: string;
	rejectionNote: string;
	reasonCode: string | null;
};

async function loadRow(
	database: Pick<Database, "select">,
	appealId: string,
): Promise<AppealRow | undefined> {
	const [row] = await database
		.select({
			id: appeals.id,
			status: appeals.status,
			note: appeals.note,
			decisionNote: appeals.decisionNote,
			createdAt: appeals.createdAt,
			learnerUserId: appeals.learnerUserId,
			firstReviewerUserId: appeals.firstReviewerUserId,
			ownerUserId: taskSubmissions.ownerUserId,
			centerId: enrollments.centerId,
			centerName: learningCenters.name,
			learnerName: users.name,
			taskId: taskSubmissions.taskId,
			rejectionNote: submissionVerifications.note,
			reasonCode: submissionVerifications.reasonCode,
		})
		.from(appeals)
		.innerJoin(taskSubmissions, eq(taskSubmissions.id, appeals.submissionId))
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.innerJoin(learningCenters, eq(learningCenters.id, enrollments.centerId))
		.innerJoin(users, eq(users.id, taskSubmissions.ownerUserId))
		.innerJoin(
			submissionVerifications,
			eq(submissionVerifications.id, appeals.verificationId),
		)
		.where(eq(appeals.id, appealId))
		.limit(1);
	return row;
}

async function accessibleRow(
	database: AppealDb,
	input: { reviewerId: number; appealId: string },
): Promise<AppealRow> {
	const centers = await reviewCenters(database, input.reviewerId);
	const row = await loadRow(database, input.appealId);
	if (!row || !centers.some((center) => center.id === row.centerId)) {
		throw errors.notFound("That appeal is not yours to open.");
	}
	if (
		row.firstReviewerUserId === input.reviewerId ||
		row.learnerUserId === input.reviewerId
	) {
		throw errors.notFound("That appeal is not yours to open.");
	}
	const relationships = await relationshipsOf(database, input.reviewerId);
	const conflict = reviewConflict({
		reviewerId: input.reviewerId,
		learnerId: row.ownerUserId,
		relationships,
	});
	if (conflict === "relative") {
		throw errors.forbidden("You cannot review a relative.", {
			reason: "relative",
		});
	}
	if (conflict === "self") {
		throw errors.notFound("That appeal is not yours to open.");
	}
	return row;
}

async function taskCopy(
	database: Pick<Database, "select">,
	taskIds: readonly string[],
) {
	const copies = new Map<
		string,
		{
			titleRw: string;
			titleEn: string;
			instructionsRw: string;
			instructionsEn: string;
		}
	>();
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

/** Open appeals at this person's centers, except rejections they wrote. */
export async function listAppeals(
	database: AppealDb,
	input: { reviewerId: number },
): Promise<{ items: AppealItem[] }> {
	const centers = await reviewCenters(database, input.reviewerId);
	const centerIds = centers.map((center) => center.id);
	if (centerIds.length === 0) return { items: [] };
	const rows = await database
		.select({
			id: appeals.id,
			createdAt: appeals.createdAt,
			learnerUserId: appeals.learnerUserId,
			learnerName: users.name,
			centerName: learningCenters.name,
			taskId: taskSubmissions.taskId,
		})
		.from(appeals)
		.innerJoin(taskSubmissions, eq(taskSubmissions.id, appeals.submissionId))
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.innerJoin(learningCenters, eq(learningCenters.id, enrollments.centerId))
		.innerJoin(users, eq(users.id, taskSubmissions.ownerUserId))
		.where(
			and(
				eq(appeals.status, "open"),
				inArray(enrollments.centerId, centerIds),
				ne(appeals.firstReviewerUserId, input.reviewerId),
				ne(appeals.learnerUserId, input.reviewerId),
			),
		)
		.orderBy(asc(appeals.createdAt))
		.limit(LIST_LIMIT);
	const relationships = await relationshipsOf(database, input.reviewerId);
	const visible = rows.filter(
		(row) =>
			reviewConflict({
				reviewerId: input.reviewerId,
				learnerId: row.learnerUserId,
				relationships,
			}) === "ok",
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

export async function readAppeal(
	database: AppealDb,
	input: { reviewerId: number; appealId: string },
): Promise<AppealDetail> {
	const row = await accessibleRow(database, input);
	if (!isAppealStatus(row.status)) {
		throw errors.internal("The appeal could not be read.");
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
		decisionNote: row.decisionNote,
		rejectionNote: row.rejectionNote,
		reasonCode: row.reasonCode,
		instructionsRw: copy?.instructionsRw ?? "",
		instructionsEn: copy?.instructionsEn ?? "",
	};
}

/** Uphold the rejection, or let the learner try again. The rejection stays stored. */
export async function closeAppeal(
	database: AppealDb,
	input: {
		reviewerId: number;
		appealId: string;
		outcome: string;
		note: string;
		ip: string;
	},
): Promise<ClosedAppeal> {
	if (!isAppealOutcome(input.outcome)) {
		throw errors.badRequest("That decision is not one of the choices.", {
			reason: "outcome",
		});
	}
	const note = cleanNote(input.note);
	const row = await accessibleRow(database, input);
	if (row.status !== "open") {
		throw errors.conflict("This appeal is already recorded.", {
			reason: "closed",
		});
	}
	const outcome = input.outcome;
	const updated = await database.transaction(async (tx) => {
		const [closed] = await tx
			.update(appeals)
			.set({
				status: outcome,
				decisionNote: note,
				decidedByUserId: input.reviewerId,
				decidedAt: new Date(),
			})
			.where(and(eq(appeals.id, row.id), eq(appeals.status, "open")))
			.returning({ id: appeals.id });
		if (!closed) return null;
		await writeAudit(tx, {
			actorId: input.reviewerId,
			action: "appeal.closed",
			targetType: "appeal",
			targetId: closed.id,
			ipAddress: input.ip,
			metadata: { outcome },
		});
		return closed;
	});
	if (!updated) {
		throw errors.conflict("This appeal is already recorded.", {
			reason: "closed",
		});
	}
	return { id: updated.id, status: outcome };
}
