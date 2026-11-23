import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../../db";
import { pointAdjustments, pointTransactions, users } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";

const AMOUNT_LIMIT = 1_000_000;
const REASON_LIMIT = 500;

export const ADJUSTMENT_STATUSES = ["pending", "approved", "rejected"] as const;

export type AdjustmentStatus = (typeof ADJUSTMENT_STATUSES)[number];

export type PointAdjustmentView = {
	id: string;
	learnerName: string;
	learnerEmail: string;
	amount: number;
	reason: string;
	requestedByName: string;
	mine: boolean;
	status: AdjustmentStatus;
	createdAt: string;
};

type AdjustmentDb = Pick<
	Database,
	"insert" | "select" | "update" | "transaction"
>;

function cleanReason(value: string): string {
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > REASON_LIMIT) {
		throw errors.badRequest("Write the reason for this adjustment.", {
			reason: "reason",
		});
	}
	return trimmed;
}

function signedAmount(value: number): number {
	if (
		!Number.isInteger(value) ||
		value === 0 ||
		value < -AMOUNT_LIMIT ||
		value > AMOUNT_LIMIT
	) {
		throw errors.badRequest("That amount is not usable.", { reason: "amount" });
	}
	return value;
}

function isStatus(value: string): value is AdjustmentStatus {
	switch (value) {
		case "pending":
		case "approved":
		case "rejected":
			return true;
		default:
			return false;
	}
}

async function learnerByEmail(
	database: Pick<Database, "select">,
	email: string,
) {
	const normalized = email.trim().toLowerCase();
	if (!normalized?.includes("@")) {
		throw errors.badRequest("Enter the learner's email.", { reason: "email" });
	}
	const [person] = await database
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			deletedAt: users.deletedAt,
		})
		.from(users)
		.where(sql`lower(${users.email}) = ${normalized}`)
		.limit(1);
	if (!person || person.deletedAt) {
		throw errors.notFound("That learner was not found.");
	}
	return person;
}

function displayName(name: string | null, email: string): string {
	const trimmed = name?.trim();
	return trimmed ? trimmed : email;
}

/** Ask a second admin to add or remove points. Nothing is written to the ledger yet. */
export async function requestPointAdjustment(
	database: AdjustmentDb,
	input: {
		actorId: number;
		email: string;
		amount: number;
		reason: string;
		ip: string;
	},
): Promise<PointAdjustmentView> {
	const amount = signedAmount(input.amount);
	const reason = cleanReason(input.reason);
	const learner = await learnerByEmail(database, input.email);
	const [created] = await database.transaction(async (tx) => {
		const [row] = await tx
			.insert(pointAdjustments)
			.values({
				learnerUserId: learner.id,
				amount,
				reason,
				requestedByUserId: input.actorId,
			})
			.returning({
				id: pointAdjustments.id,
				createdAt: pointAdjustments.createdAt,
			});
		if (!row) throw errors.internal("The adjustment was not stored.");
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "points.adjustment_requested",
			targetType: "point_adjustment",
			targetId: row.id,
			ipAddress: input.ip,
			metadata: { learnerUserId: learner.id, amount },
		});
		return [row];
	});
	if (!created) throw errors.internal("The adjustment was not stored.");
	const [actor] = await database
		.select({ name: users.name, email: users.email })
		.from(users)
		.where(eq(users.id, input.actorId))
		.limit(1);
	return {
		id: created.id,
		learnerName: displayName(learner.name, learner.email),
		learnerEmail: learner.email,
		amount,
		reason,
		requestedByName: displayName(actor?.name ?? null, actor?.email ?? ""),
		mine: true,
		status: "pending",
		createdAt: created.createdAt.toISOString(),
	};
}

/** Pending requests first, then the latest decisions. */
export async function listPointAdjustments(
	database: Pick<Database, "select">,
	actorId: number,
): Promise<PointAdjustmentView[]> {
	const learner = alias(users, "adjustment_learner");
	const requester = alias(users, "adjustment_requester");
	const rows = await database
		.select({
			id: pointAdjustments.id,
			learnerName: learner.name,
			learnerEmail: learner.email,
			amount: pointAdjustments.amount,
			reason: pointAdjustments.reason,
			requestedByName: requester.name,
			requestedByEmail: requester.email,
			requestedByUserId: pointAdjustments.requestedByUserId,
			status: pointAdjustments.status,
			createdAt: pointAdjustments.createdAt,
		})
		.from(pointAdjustments)
		.innerJoin(learner, eq(learner.id, pointAdjustments.learnerUserId))
		.innerJoin(requester, eq(requester.id, pointAdjustments.requestedByUserId))
		.orderBy(
			asc(
				sql`case when ${pointAdjustments.status} = 'pending' then 0 else 1 end`,
			),
			desc(pointAdjustments.createdAt),
		)
		.limit(50);
	return rows.flatMap((row) => {
		if (!isStatus(row.status)) return [];
		return [
			{
				id: row.id,
				learnerName: displayName(row.learnerName, row.learnerEmail),
				learnerEmail: row.learnerEmail,
				amount: row.amount,
				reason: row.reason,
				requestedByName: displayName(row.requestedByName, row.requestedByEmail),
				mine: row.requestedByUserId === actorId,
				status: row.status,
				createdAt: row.createdAt.toISOString(),
			},
		];
	});
}

async function pendingAdjustment(
	database: Pick<Database, "select">,
	id: string,
	actorId: number,
) {
	const [row] = await database
		.select({
			id: pointAdjustments.id,
			learnerUserId: pointAdjustments.learnerUserId,
			amount: pointAdjustments.amount,
			reason: pointAdjustments.reason,
			requestedByUserId: pointAdjustments.requestedByUserId,
			status: pointAdjustments.status,
		})
		.from(pointAdjustments)
		.where(eq(pointAdjustments.id, id))
		.limit(1);
	if (!row) throw errors.notFound("That adjustment was not found.");
	if (row.status !== "pending") {
		throw errors.conflict("This adjustment is already decided.", {
			reason: "closed",
		});
	}
	if (row.requestedByUserId === actorId) {
		throw errors.forbidden("Someone else has to approve this.", {
			reason: "self",
		});
	}
	return row;
}

/** The second admin writes one ledger row. The request itself is not a balance. */
export async function approvePointAdjustment(
	database: AdjustmentDb,
	input: { id: string; actorId: number; ip: string },
): Promise<PointAdjustmentView> {
	const request = await pendingAdjustment(database, input.id, input.actorId);
	await database.transaction(async (tx) => {
		const [updated] = await tx
			.update(pointAdjustments)
			.set({
				status: "approved",
				decidedByUserId: input.actorId,
				decidedAt: new Date(),
			})
			.where(
				and(
					eq(pointAdjustments.id, request.id),
					eq(pointAdjustments.status, "pending"),
				),
			)
			.returning({ id: pointAdjustments.id });
		if (!updated) {
			throw errors.conflict("This adjustment is already decided.", {
				reason: "closed",
			});
		}
		await tx.insert(pointTransactions).values({
			userId: request.learnerUserId,
			amount: request.amount,
			kind: "manual_adjustment",
			referenceType: "adjustment",
			referenceId: request.id,
			approvedByUserId: input.actorId,
		});
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "points.adjustment_approved",
			targetType: "point_adjustment",
			targetId: request.id,
			ipAddress: input.ip,
			metadata: {
				learnerUserId: request.learnerUserId,
				amount: request.amount,
			},
		});
	});
	const [view] = (await listPointAdjustments(database, input.actorId)).filter(
		(row) => row.id === request.id,
	);
	if (!view) throw errors.internal("The adjustment was not stored.");
	return view;
}

/** Turn the request down. The ledger stays unchanged. */
export async function rejectPointAdjustment(
	database: AdjustmentDb,
	input: { id: string; actorId: number; reason: string; ip: string },
): Promise<PointAdjustmentView> {
	const request = await pendingAdjustment(database, input.id, input.actorId);
	const note = cleanReason(input.reason);
	await database.transaction(async (tx) => {
		const [updated] = await tx
			.update(pointAdjustments)
			.set({
				status: "rejected",
				decidedByUserId: input.actorId,
				decisionNote: note,
				decidedAt: new Date(),
			})
			.where(
				and(
					eq(pointAdjustments.id, request.id),
					eq(pointAdjustments.status, "pending"),
				),
			)
			.returning({ id: pointAdjustments.id });
		if (!updated) {
			throw errors.conflict("This adjustment is already decided.", {
				reason: "closed",
			});
		}
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "points.adjustment_rejected",
			targetType: "point_adjustment",
			targetId: request.id,
			ipAddress: input.ip,
		});
	});
	const [view] = (await listPointAdjustments(database, input.actorId)).filter(
		(row) => row.id === request.id,
	);
	if (!view) throw errors.internal("The adjustment was not stored.");
	return view;
}
