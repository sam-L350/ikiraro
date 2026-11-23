import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import type { Database } from "../../db";
import {
	configSettings,
	enrollments,
	type JsonValue,
	taskSubmissions,
} from "../../db/schema";
import { writeAudit, writeEvent } from "../audit/write";

export const REVIEW_SLA_KEY = "review.sla_ms";
export const DEFAULT_REVIEW_SLA_MS = 72 * 60 * 60 * 1000;
export const DUE_SOON_MS = 12 * 60 * 60 * 1000;
export const MIN_REVIEW_SLA_MS = 60 * 60 * 1000;
export const MAX_REVIEW_SLA_MS = 14 * 24 * MIN_REVIEW_SLA_MS;

export type ReviewUrgency = "ok" | "soon" | "overdue";
export type EscalationStage = "none" | "manager" | "district";

type SlaDb = Pick<Database, "insert" | "select" | "update">;

/** The newest usable window wins. Anything else stays at 72 hours. */
export function pickReviewSlaMs(value: unknown): number {
	if (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= MIN_REVIEW_SLA_MS &&
		value <= MAX_REVIEW_SLA_MS
	) {
		return value;
	}
	return DEFAULT_REVIEW_SLA_MS;
}

export function reviewDueAt(submittedAt: Date, slaMs: number): Date {
	return new Date(submittedAt.getTime() + slaMs);
}

/** Time left against the stored deadline. */
export function reviewUrgency(dueAt: Date, now: Date): ReviewUrgency {
	const remaining = dueAt.getTime() - now.getTime();
	if (remaining <= 0) return "overdue";
	if (remaining <= DUE_SOON_MS) return "soon";
	return "ok";
}

/**
 * One step when the deadline has passed.
 * A full extra window after the deadline moves the attempt to the district.
 */
export function nextEscalation(input: {
	stage: EscalationStage;
	dueAt: Date;
	now: Date;
	slaMs: number;
}): EscalationStage | null {
	const due = input.dueAt.getTime();
	const now = input.now.getTime();
	const districtAt = due + input.slaMs;
	switch (input.stage) {
		case "none":
			if (now >= districtAt) return "district";
			if (now >= due) return "manager";
			return null;
		case "manager":
			if (now >= districtAt) return "district";
			return null;
		case "district":
			return null;
		default: {
			const unreachable: never = input.stage;
			return unreachable;
		}
	}
}

export function escalationStage(value: string): EscalationStage {
	switch (value) {
		case "none":
		case "manager":
		case "district":
			return value;
		default:
			return "none";
	}
}

export async function readReviewSlaMs(
	database: Pick<Database, "select">,
): Promise<number> {
	const rows = await database
		.select({
			version: configSettings.version,
			value: configSettings.value,
		})
		.from(configSettings)
		.where(eq(configSettings.key, REVIEW_SLA_KEY));
	let latest: { version: number; value: JsonValue } | undefined;
	for (const row of rows) {
		if (!latest || row.version >= latest.version) latest = row;
	}
	return pickReviewSlaMs(latest?.value);
}

/** Move overdue waiting attempts to the center manager, then the district. */
export async function escalateOverdue(
	database: SlaDb,
	now = new Date(),
): Promise<number> {
	const slaMs = await readReviewSlaMs(database);
	const rows = await database
		.select({
			id: taskSubmissions.id,
			escalation: taskSubmissions.escalation,
			reviewDueAt: taskSubmissions.reviewDueAt,
			centerId: enrollments.centerId,
		})
		.from(taskSubmissions)
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.where(
			and(
				inArray(taskSubmissions.status, ["pending", "in_review"]),
				isNotNull(taskSubmissions.reviewDueAt),
				lte(taskSubmissions.reviewDueAt, now),
			),
		)
		.orderBy(asc(taskSubmissions.reviewDueAt))
		.limit(200);
	let moved = 0;
	for (const row of rows) {
		if (!row.reviewDueAt) continue;
		const stage = escalationStage(row.escalation);
		const next = nextEscalation({
			stage,
			dueAt: row.reviewDueAt,
			now,
			slaMs,
		});
		if (!next) continue;
		const [updated] = await database
			.update(taskSubmissions)
			.set({ escalation: next })
			.where(
				and(
					eq(taskSubmissions.id, row.id),
					eq(taskSubmissions.escalation, stage),
				),
			)
			.returning({ id: taskSubmissions.id });
		if (!updated) continue;
		moved += 1;
		await writeAudit(database, {
			action: "submission.escalated",
			targetType: "task_submission",
			targetId: row.id,
			metadata: { stage: next },
		});
		await writeEvent(database, {
			name: "submission.escalated",
			payload: {
				submissionId: row.id,
				stage: next,
				centerId: row.centerId,
			},
		});
	}
	return moved;
}
