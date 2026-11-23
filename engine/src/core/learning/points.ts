import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db";
import {
	courses,
	modules,
	pointCaps,
	pointRules,
	pointTransactions,
	tasks,
} from "../../db/schema";
import { errors } from "../api/error";

export const POINT_KINDS = [
	"task_approved",
	"module_completed",
	"course_completed",
	"streak_bonus",
	"community_contribution",
	"manual_adjustment",
	"reversal",
] as const;

export type PointKind = (typeof POINT_KINDS)[number];

export const POINT_TARGETS = ["task", "module", "course"] as const;

export type PointTarget = (typeof POINT_TARGETS)[number];

const AMOUNT_LIMIT = 1_000_000;
const WEIGHT_LIMIT = 1_000;

export type PointRuleView = {
	id: string;
	targetType: PointTarget;
	targetId: string;
	version: number;
	points: number;
	weight: number;
};

export type PointCapView = {
	id: string;
	version: number;
	dailyCap: number;
	photoCap: number;
	fileCap: number;
	noteCap: number;
};

export type PointEntry = {
	id: string;
	createdAt: string;
	amount: number;
	uncappedAmount: number | null;
	kind: PointKind;
	referenceType: string;
	referenceId: string;
};

export type PointStatement = {
	balance: number;
	entries: PointEntry[];
};

type PointDb = Pick<Database, "insert" | "select">;

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		value,
	);
}

function isTarget(value: string): value is PointTarget {
	switch (value) {
		case "task":
		case "module":
		case "course":
			return true;
		default:
			return false;
	}
}

function isKind(value: string): value is PointKind {
	switch (value) {
		case "task_approved":
		case "module_completed":
		case "course_completed":
		case "streak_bonus":
		case "community_contribution":
		case "manual_adjustment":
		case "reversal":
			return true;
		default:
			return false;
	}
}

function whole(value: number, limit: number, reason: string): number {
	if (!Number.isInteger(value) || value < 0 || value > limit) {
		throw errors.badRequest("That amount is not usable.", { reason });
	}
	return value;
}

async function targetExists(
	database: PointDb,
	targetType: PointTarget,
	targetId: string,
): Promise<boolean> {
	switch (targetType) {
		case "task": {
			const [row] = await database
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.id, targetId))
				.limit(1);
			return Boolean(row);
		}
		case "module": {
			const [row] = await database
				.select({ id: modules.id })
				.from(modules)
				.where(eq(modules.id, targetId))
				.limit(1);
			return Boolean(row);
		}
		case "course": {
			const [row] = await database
				.select({ id: courses.id })
				.from(courses)
				.where(eq(courses.id, targetId))
				.limit(1);
			return Boolean(row);
		}
		default: {
			const unreachable: never = targetType;
			return unreachable;
		}
	}
}

/** Publish the next rule version. The previous row stays. */
export async function createPointRule(
	database: PointDb,
	input: {
		actorId: number;
		targetType: string;
		targetId: string;
		points: number;
		weight: number;
	},
): Promise<PointRuleView> {
	if (!isTarget(input.targetType) || !isUuid(input.targetId)) {
		throw errors.badRequest("Choose a task, module, or course.", {
			reason: "target",
		});
	}
	const points = whole(input.points, AMOUNT_LIMIT, "points");
	if (
		!Number.isInteger(input.weight) ||
		input.weight < 1 ||
		input.weight > WEIGHT_LIMIT
	) {
		throw errors.badRequest("Weight starts at 1.", { reason: "weight" });
	}
	const targetType = input.targetType;
	const found = await targetExists(database, targetType, input.targetId);
	if (!found) throw errors.notFound("That target was not found.");
	const [latest] = await database
		.select({ version: pointRules.version })
		.from(pointRules)
		.where(
			and(
				eq(pointRules.targetType, targetType),
				eq(pointRules.targetId, input.targetId),
			),
		)
		.orderBy(desc(pointRules.version))
		.limit(1);
	const version = (latest?.version ?? 0) + 1;
	const [created] = await database
		.insert(pointRules)
		.values({
			targetType,
			targetId: input.targetId,
			version,
			points,
			weight: input.weight,
			createdByUserId: input.actorId,
		})
		.returning({
			id: pointRules.id,
			targetType: pointRules.targetType,
			targetId: pointRules.targetId,
			version: pointRules.version,
			points: pointRules.points,
			weight: pointRules.weight,
		});
	if (!created || !isTarget(created.targetType)) {
		throw errors.internal("The point rule was not stored.");
	}
	return {
		id: created.id,
		targetType: created.targetType,
		targetId: created.targetId,
		version: created.version,
		points: created.points,
		weight: created.weight,
	};
}

/** Publish the next cap version. The previous row stays. */
export async function createPointCap(
	database: PointDb,
	input: {
		actorId: number;
		dailyCap: number;
		photoCap: number;
		fileCap: number;
		noteCap: number;
	},
): Promise<PointCapView> {
	const dailyCap = whole(input.dailyCap, AMOUNT_LIMIT, "daily");
	const photoCap = whole(input.photoCap, AMOUNT_LIMIT, "photo");
	const fileCap = whole(input.fileCap, AMOUNT_LIMIT, "file");
	const noteCap = whole(input.noteCap, AMOUNT_LIMIT, "note");
	const [latest] = await database
		.select({ version: pointCaps.version })
		.from(pointCaps)
		.orderBy(desc(pointCaps.version))
		.limit(1);
	const version = (latest?.version ?? 0) + 1;
	const [created] = await database
		.insert(pointCaps)
		.values({
			version,
			dailyCap,
			photoCap,
			fileCap,
			noteCap,
			createdByUserId: input.actorId,
		})
		.returning({
			id: pointCaps.id,
			version: pointCaps.version,
			dailyCap: pointCaps.dailyCap,
			photoCap: pointCaps.photoCap,
			fileCap: pointCaps.fileCap,
			noteCap: pointCaps.noteCap,
		});
	if (!created) throw errors.internal("The point cap was not stored.");
	return created;
}

/** Every ledger row for this person, newest first. The balance is their sum. */
export async function listPointStatement(
	database: Pick<Database, "select">,
	userId: number,
): Promise<PointStatement> {
	const rows = await database
		.select({
			id: pointTransactions.id,
			createdAt: pointTransactions.createdAt,
			amount: pointTransactions.amount,
			uncappedAmount: pointTransactions.uncappedAmount,
			kind: pointTransactions.kind,
			referenceType: pointTransactions.referenceType,
			referenceId: pointTransactions.referenceId,
		})
		.from(pointTransactions)
		.where(eq(pointTransactions.userId, userId))
		.orderBy(desc(pointTransactions.createdAt), desc(pointTransactions.id));
	const entries: PointEntry[] = [];
	let balance = 0;
	for (const row of rows) {
		if (!isKind(row.kind)) {
			throw errors.internal("A point row could not be read.");
		}
		balance += row.amount;
		entries.push({
			id: row.id,
			createdAt: row.createdAt.toISOString(),
			amount: row.amount,
			uncappedAmount: row.uncappedAmount,
			kind: row.kind,
			referenceType: row.referenceType,
			referenceId: row.referenceId,
		});
	}
	return { balance, entries };
}
