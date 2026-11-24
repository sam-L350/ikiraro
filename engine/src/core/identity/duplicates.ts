import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../../db";
import {
	accountMergeRequests,
	accountMerges,
	enrollments,
	learningCenters,
	mediaObjects,
	sessions,
	taskSubmissions,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { ROLE_PERMISSIONS } from "../authz/catalog";
import type { Assignment } from "../authz/decide";
import { TOMBSTONE_NAME, tombstoneEmail } from "./privacy";

type MergeDb = Pick<
	Database,
	"delete" | "insert" | "select" | "transaction" | "update"
>;

const REASON_LIMIT = 400;

export type DuplicatePerson = {
	id: number;
	name: string | null;
	dateOfBirth: string | null;
	centerName: string | null;
};

export type DuplicatePair = {
	reason: "phone" | "identity";
	first: DuplicatePerson;
	second: DuplicatePerson;
};

export type WaitingMerge = {
	id: string;
	keepName: string | null;
	dropName: string | null;
	reason: string;
	mine: boolean;
	createdAt: string;
};

export type DuplicateList = {
	pairs: DuplicatePair[];
	waiting: WaitingMerge[];
};

type PersonRow = {
	id: number;
	name: string | null;
	phone: string | null;
	dateOfBirth: string | null;
	centerId: string | null;
	deletedAt: Date | null;
};

function requireAdmin(assignments: readonly Assignment[]): void {
	const allowed = assignments.some((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes("admin.manage"),
	);
	if (!allowed) {
		throw errors.forbidden("An administrator reviews possible duplicates.", {
			reason: "duplicate",
		});
	}
}

function isUserId(value: number): boolean {
	return Number.isInteger(value) && value > 0;
}

function normalizeName(value: string | null): string {
	return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function samePerson(
	left: PersonRow,
	right: PersonRow,
): "phone" | "identity" | null {
	if (left.deletedAt || right.deletedAt || left.id === right.id) return null;
	if (left.phone && left.phone === right.phone) return "phone";
	const name = normalizeName(left.name);
	if (
		left.centerId &&
		left.centerId === right.centerId &&
		left.dateOfBirth &&
		left.dateOfBirth === right.dateOfBirth &&
		name.length > 0 &&
		name === normalizeName(right.name)
	) {
		return "identity";
	}
	return null;
}

function cleanReason(value: string, empty: string): string {
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > REASON_LIMIT) {
		throw errors.badRequest(empty, { reason: "duplicate" });
	}
	return trimmed;
}

async function readPerson(
	database: Pick<Database, "select">,
	userId: number,
): Promise<PersonRow | null> {
	const [row] = await database
		.select({
			id: users.id,
			name: users.name,
			phone: users.phone,
			dateOfBirth: users.dateOfBirth,
			centerId: users.centerId,
			deletedAt: users.deletedAt,
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row ?? null;
}

/** Possible duplicates, and merges that still wait for a second admin. */
export async function readDuplicates(
	database: Pick<Database, "select">,
	input: { actorId: number; assignments: readonly Assignment[] },
): Promise<DuplicateList> {
	requireAdmin(input.assignments);
	const first = alias(users, "duplicate_first");
	const second = alias(users, "duplicate_second");
	const firstCenter = alias(learningCenters, "duplicate_first_center");
	const secondCenter = alias(learningCenters, "duplicate_second_center");
	const rows = await database
		.select({
			firstId: first.id,
			firstName: first.name,
			firstPhone: first.phone,
			firstDob: first.dateOfBirth,
			firstCenter: firstCenter.name,
			secondId: second.id,
			secondName: second.name,
			secondPhone: second.phone,
			secondDob: second.dateOfBirth,
			secondCenter: secondCenter.name,
		})
		.from(first)
		.innerJoin(second, sql`${first.id} < ${second.id}`)
		.leftJoin(firstCenter, eq(firstCenter.id, first.centerId))
		.leftJoin(secondCenter, eq(secondCenter.id, second.centerId))
		.where(
			and(
				isNull(first.deletedAt),
				isNull(second.deletedAt),
				sql`(
					(${first.phone} is not null and ${first.phone} = ${second.phone})
					or (
						${first.centerId} is not null
						and ${first.centerId} = ${second.centerId}
						and ${first.dateOfBirth} is not null
						and ${first.dateOfBirth} = ${second.dateOfBirth}
						and char_length(btrim(${first.name})) > 0
						and regexp_replace(lower(btrim(${first.name})), '[[:space:]]+', ' ', 'g')
							= regexp_replace(lower(btrim(${second.name})), '[[:space:]]+', ' ', 'g')
					)
				)`,
			),
		);
	const pairs: DuplicatePair[] = rows.map((row) => ({
		reason:
			row.firstPhone && row.firstPhone === row.secondPhone
				? "phone"
				: "identity",
		first: {
			id: row.firstId,
			name: row.firstName,
			dateOfBirth: row.firstDob,
			centerName: row.firstCenter,
		},
		second: {
			id: row.secondId,
			name: row.secondName,
			dateOfBirth: row.secondDob,
			centerName: row.secondCenter,
		},
	}));
	const keep = alias(users, "merge_keep");
	const drop = alias(users, "merge_drop");
	const waitingRows = await database
		.select({
			id: accountMergeRequests.id,
			keepName: keep.name,
			dropName: drop.name,
			reason: accountMergeRequests.reason,
			requestedByUserId: accountMergeRequests.requestedByUserId,
			createdAt: accountMergeRequests.createdAt,
		})
		.from(accountMergeRequests)
		.innerJoin(keep, eq(keep.id, accountMergeRequests.keepUserId))
		.innerJoin(drop, eq(drop.id, accountMergeRequests.dropUserId))
		.where(eq(accountMergeRequests.status, "pending"))
		.orderBy(asc(accountMergeRequests.createdAt));
	return {
		pairs,
		waiting: waitingRows.map((row) => ({
			id: row.id,
			keepName: row.keepName,
			dropName: row.dropName,
			reason: row.reason,
			mine: row.requestedByUserId === input.actorId,
			createdAt: row.createdAt.toISOString(),
		})),
	};
}

/** Ask a second admin to close one account into the other. */
export async function proposeMerge(
	database: MergeDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		keepUserId: number;
		dropUserId: number;
		reason: string;
		ip: string;
	},
): Promise<{ id: string }> {
	requireAdmin(input.assignments);
	if (!isUserId(input.keepUserId) || !isUserId(input.dropUserId)) {
		throw errors.notFound("That person was not found.");
	}
	const reason = cleanReason(
		input.reason,
		"Write why these are the same person.",
	);
	const keep = await readPerson(database, input.keepUserId);
	const drop = await readPerson(database, input.dropUserId);
	if (!keep || !drop || !samePerson(keep, drop)) {
		throw errors.notFound("That person was not found.");
	}
	const [pending] = await database
		.select({ id: accountMergeRequests.id })
		.from(accountMergeRequests)
		.where(
			and(
				eq(accountMergeRequests.status, "pending"),
				or(
					and(
						eq(accountMergeRequests.keepUserId, keep.id),
						eq(accountMergeRequests.dropUserId, drop.id),
					),
					and(
						eq(accountMergeRequests.keepUserId, drop.id),
						eq(accountMergeRequests.dropUserId, keep.id),
					),
				),
			),
		)
		.limit(1);
	if (pending) {
		throw errors.conflict("A merge is already waiting.", {
			reason: "duplicate",
		});
	}
	const [created] = await database
		.insert(accountMergeRequests)
		.values({
			keepUserId: keep.id,
			dropUserId: drop.id,
			reason,
			requestedByUserId: input.actorId,
		})
		.returning({ id: accountMergeRequests.id });
	if (!created) throw errors.notFound("That person was not found.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "account_merge.requested",
		targetType: "account_merge",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: { keepUserId: keep.id, dropUserId: drop.id },
	});
	return { id: created.id };
}

async function closeDuplicate(
	database: MergeDb,
	input: {
		keepUserId: number;
		dropUserId: number;
		requestId: string;
		actorId: number;
		ip: string;
	},
): Promise<void> {
	const keep = await readPerson(database, input.keepUserId);
	const drop = await readPerson(database, input.dropUserId);
	if (!keep || !drop || keep.deletedAt || drop.deletedAt) {
		throw errors.conflict("These accounts are no longer the same person.", {
			reason: "duplicate",
		});
	}
	if (!samePerson(keep, drop)) {
		throw errors.conflict("These accounts are no longer the same person.", {
			reason: "duplicate",
		});
	}
	await database.transaction(async (tx) => {
		if (!keep.phone && drop.phone) {
			await tx.update(users).set({ phone: null }).where(eq(users.id, drop.id));
			await tx
				.update(users)
				.set({ phone: drop.phone })
				.where(eq(users.id, keep.id));
		}
		const dropCourses = await tx
			.select({ id: enrollments.id, courseId: enrollments.courseId })
			.from(enrollments)
			.where(eq(enrollments.userId, drop.id));
		const keepCourses = await tx
			.select({ courseId: enrollments.courseId })
			.from(enrollments)
			.where(eq(enrollments.userId, keep.id));
		const taken = new Set(keepCourses.map((row) => row.courseId));
		const moved = dropCourses
			.filter((row) => !taken.has(row.courseId))
			.map((row) => row.id);
		if (moved.length > 0) {
			await tx
				.update(enrollments)
				.set({ userId: keep.id })
				.where(inArray(enrollments.id, moved));
			await tx
				.update(taskSubmissions)
				.set({ ownerUserId: keep.id })
				.where(
					and(
						eq(taskSubmissions.ownerUserId, drop.id),
						inArray(taskSubmissions.enrollmentId, moved),
					),
				);
		}
		await tx
			.update(mediaObjects)
			.set({ ownerUserId: keep.id })
			.where(eq(mediaObjects.ownerUserId, drop.id));
		await tx.delete(sessions).where(eq(sessions.userId, drop.id));
		await tx
			.update(users)
			.set({
				name: TOMBSTONE_NAME,
				email: tombstoneEmail(drop.id),
				phone: null,
				passwordHash: null,
				picture: null,
				dateOfBirth: null,
				gender: null,
				district: null,
				sector: null,
				village: null,
				economicSector: null,
				photoKey: null,
				guardianContact: null,
				deletedAt: new Date(),
			})
			.where(eq(users.id, drop.id));
		await tx.insert(accountMerges).values({
			requestId: input.requestId,
			keepUserId: keep.id,
			dropUserId: drop.id,
		});
		await tx
			.update(accountMergeRequests)
			.set({
				status: "approved",
				decidedByUserId: input.actorId,
				decidedAt: new Date(),
			})
			.where(eq(accountMergeRequests.id, input.requestId));
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "account_merge.approved",
			targetType: "account_merge",
			targetId: input.requestId,
			ipAddress: input.ip,
			metadata: { keepUserId: keep.id, dropUserId: drop.id },
		});
	});
}

/** A different admin approves or stops a waiting merge. */
export async function decideMerge(
	database: MergeDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		requestId: string;
		decision: string;
		note: string;
		ip: string;
	},
): Promise<{ id: string; status: "approved" | "declined" }> {
	requireAdmin(input.assignments);
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			input.requestId,
		)
	) {
		throw errors.notFound("That merge was not found.");
	}
	if (input.decision !== "approved" && input.decision !== "declined") {
		throw errors.badRequest("Choose what to do with this merge.", {
			reason: "duplicate",
		});
	}
	const [request] = await database
		.select({
			id: accountMergeRequests.id,
			keepUserId: accountMergeRequests.keepUserId,
			dropUserId: accountMergeRequests.dropUserId,
			requestedByUserId: accountMergeRequests.requestedByUserId,
			status: accountMergeRequests.status,
		})
		.from(accountMergeRequests)
		.where(eq(accountMergeRequests.id, input.requestId))
		.limit(1);
	if (request?.status !== "pending") {
		throw errors.notFound("That merge was not found.");
	}
	if (request.requestedByUserId === input.actorId) {
		throw errors.forbidden("A different administrator decides.", {
			reason: "duplicate",
		});
	}
	if (input.decision === "declined") {
		const note = cleanReason(input.note, "Write why this merge stops.");
		await database
			.update(accountMergeRequests)
			.set({
				status: "declined",
				decidedByUserId: input.actorId,
				decisionNote: note,
				decidedAt: new Date(),
			})
			.where(eq(accountMergeRequests.id, request.id));
		await writeAudit(database, {
			actorId: input.actorId,
			action: "account_merge.declined",
			targetType: "account_merge",
			targetId: request.id,
			ipAddress: input.ip,
		});
		return { id: request.id, status: "declined" };
	}
	await closeDuplicate(database, {
		keepUserId: request.keepUserId,
		dropUserId: request.dropUserId,
		requestId: request.id,
		actorId: input.actorId,
		ip: input.ip,
	});
	return { id: request.id, status: "approved" };
}
