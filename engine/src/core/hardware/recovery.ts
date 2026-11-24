import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db";
import {
	grantExceptions,
	hardwareGrants,
	hardwareInventory,
	hardwareRecoveries,
	hardwareStatusHistory,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type RecoveryDb = Pick<
	Database,
	"insert" | "select" | "transaction" | "update"
>;
type Situation = "unused" | "lost" | "misused";

export type RecoveryGrant = {
	id: string;
	itemName: string;
	recipientName: string;
	hasConditions: boolean;
	agreed: boolean;
	recovered: boolean;
};

export type RecoveryDetail = {
	id: string;
	itemName: string;
	serial: string;
	recipientName: string;
	status: "active" | "recovered" | "transferred";
	conditions: string | null;
	agreed: boolean;
	situation: Situation | null;
	reason: string | null;
};

export type AwardCondition = {
	id: string;
	itemName: string;
	conditions: string | null;
	agreed: boolean;
};

export type ExceptionGrant = {
	id: string;
	itemName: string;
	recipientName: string;
};

export type GrantExceptionView = {
	id: string;
	grantId: string;
	itemName: string;
	reason: string;
	mine: boolean;
	status: "pending" | "approved" | "rejected";
	publicSummary: boolean;
};

export type PublicException = {
	id: string;
	reason: string;
	decidedAt: string;
};

function isUuid(value: string): boolean {
	return UUID_RE.test(value);
}

function personName(name: string | null, email: string): string {
	const trimmed = name?.trim();
	return trimmed ? trimmed : email;
}

function cleanText(value: string, limit: number, reason: string): string {
	const text = value.trim();
	if (text.length < 1 || text.length > limit) {
		throw errors.badRequest("Write the reason in your own words.", { reason });
	}
	return text;
}

function asSituation(value: string): Situation {
	switch (value) {
		case "unused":
		case "lost":
		case "misused":
			return value;
		default:
			throw errors.badRequest(
				"Choose whether it was unused, lost, or misused.",
				{
					reason: "situation",
				},
			);
	}
}

function asGrantStatus(value: string): "active" | "recovered" | "transferred" {
	switch (value) {
		case "active":
		case "recovered":
		case "transferred":
			return value;
		default:
			return "active";
	}
}

function asExceptionStatus(value: string): "pending" | "approved" | "rejected" {
	switch (value) {
		case "pending":
		case "approved":
		case "rejected":
			return value;
		default:
			return "pending";
	}
}

function isUniqueViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if ("code" in error && error.code === "23505") return true;
	if ("cause" in error) return isUniqueViolation(error.cause);
	return false;
}

async function loadGrant(database: RecoveryDb, grantId: string) {
	if (!isUuid(grantId)) throw errors.notFound("That grant was not found.");
	const [row] = await database
		.select({
			id: hardwareGrants.id,
			status: hardwareGrants.status,
			inventoryId: hardwareGrants.inventoryId,
			recipientUserId: hardwareGrants.recipientUserId,
			conditions: hardwareGrants.conditions,
			conditionsAgreedAt: hardwareGrants.conditionsAgreedAt,
			itemName: hardwareInventory.name,
			serial: hardwareInventory.serial,
			itemStatus: hardwareInventory.status,
			centerId: hardwareInventory.centerId,
			recipientName: users.name,
			recipientEmail: users.email,
		})
		.from(hardwareGrants)
		.innerJoin(
			hardwareInventory,
			eq(hardwareInventory.id, hardwareGrants.inventoryId),
		)
		.innerJoin(users, eq(users.id, hardwareGrants.recipientUserId))
		.where(eq(hardwareGrants.id, grantId))
		.limit(1);
	if (!row) throw errors.notFound("That grant was not found.");
	return row;
}

/** Active and recovered grants the officer can still read. */
export async function listRecoveries(
	database: RecoveryDb,
): Promise<RecoveryGrant[]> {
	const rows = await database
		.select({
			id: hardwareGrants.id,
			status: hardwareGrants.status,
			conditions: hardwareGrants.conditions,
			agreedAt: hardwareGrants.conditionsAgreedAt,
			itemName: hardwareInventory.name,
			recipientName: users.name,
			recipientEmail: users.email,
		})
		.from(hardwareGrants)
		.innerJoin(
			hardwareInventory,
			eq(hardwareInventory.id, hardwareGrants.inventoryId),
		)
		.innerJoin(users, eq(users.id, hardwareGrants.recipientUserId))
		.orderBy(desc(hardwareGrants.createdAt))
		.limit(100);
	return rows.map((row) => ({
		id: row.id,
		itemName: row.itemName,
		recipientName: personName(row.recipientName, row.recipientEmail),
		hasConditions: row.conditions !== null,
		agreed: row.agreedAt !== null,
		recovered: row.status === "recovered",
	}));
}

/** The conditions, the agreement, and any recovery already stored. */
export async function readRecovery(
	database: RecoveryDb,
	grantId: string,
): Promise<RecoveryDetail> {
	const grant = await loadGrant(database, grantId);
	const [recovery] = await database
		.select({
			situation: hardwareRecoveries.situation,
			reason: hardwareRecoveries.reason,
		})
		.from(hardwareRecoveries)
		.where(eq(hardwareRecoveries.grantId, grant.id))
		.limit(1);
	let situation: Situation | null = null;
	if (recovery) {
		situation = asSituation(recovery.situation);
	}
	return {
		id: grant.id,
		itemName: grant.itemName,
		serial: grant.serial,
		recipientName: personName(grant.recipientName, grant.recipientEmail),
		status: asGrantStatus(grant.status),
		conditions: grant.conditions,
		agreed: grant.conditionsAgreedAt !== null,
		situation,
		reason: recovery?.reason ?? null,
	};
}

/** Store the words the recipient will agree to. They are not filled in for you. */
export async function writeConditions(
	database: RecoveryDb,
	input: { actorId: number; grantId: string; conditions: string; ip: string },
): Promise<{ id: string }> {
	const grant = await loadGrant(database, input.grantId);
	if (grant.conditionsAgreedAt) {
		throw errors.conflict("The recipient already agreed to these words.", {
			reason: "closed",
		});
	}
	const conditions = cleanText(input.conditions, 800, "conditions");
	const [updated] = await database
		.update(hardwareGrants)
		.set({ conditions })
		.where(
			and(
				eq(hardwareGrants.id, grant.id),
				isNull(hardwareGrants.conditionsAgreedAt),
			),
		)
		.returning({ id: hardwareGrants.id });
	if (!updated) {
		throw errors.conflict("The recipient already agreed to these words.", {
			reason: "closed",
		});
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "grant.conditions_stored",
		targetType: "hardware_grant",
		targetId: grant.id,
		ipAddress: input.ip,
		metadata: { grantId: grant.id },
	});
	return { id: grant.id };
}

/** The recipient agrees to the words stored on their grant. */
export async function agreeConditions(
	database: RecoveryDb,
	input: { actorId: number; grantId: string; ip: string },
): Promise<{ id: string }> {
	const grant = await loadGrant(database, input.grantId);
	if (input.actorId !== grant.recipientUserId) {
		throw errors.forbidden("Only the recipient can agree.", { reason: "self" });
	}
	if (!grant.conditions) {
		throw errors.conflict("The conditions have not been written yet.", {
			reason: "conditions",
		});
	}
	if (grant.conditionsAgreedAt) {
		throw errors.conflict("The recipient already agreed to these words.", {
			reason: "closed",
		});
	}
	const [updated] = await database
		.update(hardwareGrants)
		.set({ conditionsAgreedAt: new Date() })
		.where(
			and(
				eq(hardwareGrants.id, grant.id),
				eq(hardwareGrants.recipientUserId, input.actorId),
				isNull(hardwareGrants.conditionsAgreedAt),
			),
		)
		.returning({ id: hardwareGrants.id });
	if (!updated) {
		throw errors.conflict("The recipient already agreed to these words.", {
			reason: "closed",
		});
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "grant.conditions_agreed",
		targetType: "hardware_grant",
		targetId: grant.id,
		ipAddress: input.ip,
		metadata: { grantId: grant.id },
	});
	return { id: grant.id };
}

/** The grants whose conditions this person can read. */
export async function listOwnConditions(
	database: RecoveryDb,
	actorId: number,
): Promise<AwardCondition[]> {
	const rows = await database
		.select({
			id: hardwareGrants.id,
			itemName: hardwareInventory.name,
			conditions: hardwareGrants.conditions,
			agreedAt: hardwareGrants.conditionsAgreedAt,
		})
		.from(hardwareGrants)
		.innerJoin(
			hardwareInventory,
			eq(hardwareInventory.id, hardwareGrants.inventoryId),
		)
		.where(eq(hardwareGrants.recipientUserId, actorId))
		.orderBy(desc(hardwareGrants.createdAt))
		.limit(50);
	return rows.map((row) => ({
		id: row.id,
		itemName: row.itemName,
		conditions: row.conditions,
		agreed: row.agreedAt !== null,
	}));
}

/** Return the item to stock and keep the reason beside the grant. */
export async function recoverItem(
	database: RecoveryDb,
	input: {
		actorId: number;
		grantId: string;
		situation: string;
		reason: string;
		ip: string;
	},
): Promise<{ id: string }> {
	const grant = await loadGrant(database, input.grantId);
	const situation = asSituation(input.situation);
	const reason = cleanText(input.reason, 400, "reason");
	try {
		return await database.transaction(async (tx) => {
			const [locked] = await tx
				.select({ id: hardwareGrants.id, status: hardwareGrants.status })
				.from(hardwareGrants)
				.where(eq(hardwareGrants.id, grant.id))
				.for("update")
				.limit(1);
			if (locked?.status !== "active") {
				throw errors.conflict("This grant is no longer active.", {
					reason: "closed",
				});
			}
			const [row] = await tx
				.insert(hardwareRecoveries)
				.values({
					grantId: grant.id,
					situation,
					reason,
					recordedByUserId: input.actorId,
				})
				.returning({ id: hardwareRecoveries.id });
			if (!row) throw errors.internal("The recovery was not stored.");
			await tx
				.update(hardwareGrants)
				.set({ status: "recovered" })
				.where(eq(hardwareGrants.id, grant.id));
			await tx
				.update(hardwareInventory)
				.set({ status: "in_stock", currentHolderUserId: null })
				.where(eq(hardwareInventory.id, grant.inventoryId));
			await tx.insert(hardwareStatusHistory).values({
				inventoryId: grant.inventoryId,
				status: "in_stock",
				centerId: grant.centerId,
				holderUserId: null,
				recordedByUserId: input.actorId,
			});
			await writeAudit(tx, {
				actorId: input.actorId,
				action: "grant.recovered",
				targetType: "hardware_grant",
				targetId: grant.id,
				ipAddress: input.ip,
				metadata: { grantId: grant.id },
			});
			return { id: row.id };
		});
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		throw errors.conflict("This grant is no longer active.", {
			reason: "closed",
		});
	}
}

/** Open requests, and the grants an exception can name. */
export async function listExceptions(
	database: RecoveryDb,
	actorId: number,
): Promise<{ exceptions: GrantExceptionView[]; grants: ExceptionGrant[] }> {
	const exceptions = await database
		.select({
			id: grantExceptions.id,
			grantId: grantExceptions.grantId,
			itemName: hardwareInventory.name,
			reason: grantExceptions.reason,
			requestedByUserId: grantExceptions.requestedByUserId,
			status: grantExceptions.status,
			publicSummary: grantExceptions.publicSummary,
		})
		.from(grantExceptions)
		.innerJoin(hardwareGrants, eq(hardwareGrants.id, grantExceptions.grantId))
		.innerJoin(
			hardwareInventory,
			eq(hardwareInventory.id, hardwareGrants.inventoryId),
		)
		.orderBy(desc(grantExceptions.createdAt))
		.limit(100);
	const grants = await database
		.select({
			id: hardwareGrants.id,
			itemName: hardwareInventory.name,
			recipientName: users.name,
			recipientEmail: users.email,
		})
		.from(hardwareGrants)
		.innerJoin(
			hardwareInventory,
			eq(hardwareInventory.id, hardwareGrants.inventoryId),
		)
		.innerJoin(users, eq(users.id, hardwareGrants.recipientUserId))
		.where(eq(hardwareGrants.status, "active"))
		.orderBy(desc(hardwareGrants.createdAt))
		.limit(100);
	return {
		exceptions: exceptions.map((row) => ({
			id: row.id,
			grantId: row.grantId,
			itemName: row.itemName,
			reason: row.reason,
			mine: row.requestedByUserId === actorId,
			status: asExceptionStatus(row.status),
			publicSummary: row.publicSummary,
		})),
		grants: grants.map((row) => ({
			id: row.id,
			itemName: row.itemName,
			recipientName: personName(row.recipientName, row.recipientEmail),
		})),
	};
}

/** Ask a different admin to set a rule aside. Nothing is public yet. */
export async function requestException(
	database: RecoveryDb,
	input: { actorId: number; grantId: string; reason: string; ip: string },
): Promise<{ id: string }> {
	const grant = await loadGrant(database, input.grantId);
	const reason = cleanText(input.reason, 400, "reason");
	try {
		const [row] = await database
			.insert(grantExceptions)
			.values({
				grantId: grant.id,
				reason,
				requestedByUserId: input.actorId,
			})
			.returning({ id: grantExceptions.id });
		if (!row) throw errors.internal("The exception was not stored.");
		await writeAudit(database, {
			actorId: input.actorId,
			action: "grant.exception_requested",
			targetType: "grant_exception",
			targetId: row.id,
			ipAddress: input.ip,
			metadata: { grantId: grant.id },
		});
		return { id: row.id };
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		throw errors.conflict("This grant already has an open exception.", {
			reason: "duplicate",
		});
	}
}

async function pendingException(
	database: RecoveryDb,
	id: string,
	actorId: number,
) {
	if (!isUuid(id)) throw errors.notFound("That exception was not found.");
	const [row] = await database
		.select({
			id: grantExceptions.id,
			grantId: grantExceptions.grantId,
			requestedByUserId: grantExceptions.requestedByUserId,
			status: grantExceptions.status,
		})
		.from(grantExceptions)
		.where(eq(grantExceptions.id, id))
		.limit(1);
	if (!row) throw errors.notFound("That exception was not found.");
	if (row.status !== "pending") {
		throw errors.conflict("This exception is already decided.", {
			reason: "closed",
		});
	}
	if (row.requestedByUserId === actorId) {
		throw errors.forbidden("Someone else has to decide this.", {
			reason: "self",
		});
	}
	return row;
}

/** The second admin makes the exception public. Hiding it is not a choice. */
export async function approveException(
	database: RecoveryDb,
	input: { actorId: number; exceptionId: string; ip: string },
): Promise<{ id: string }> {
	const request = await pendingException(
		database,
		input.exceptionId,
		input.actorId,
	);
	const [updated] = await database
		.update(grantExceptions)
		.set({
			status: "approved",
			decidedByUserId: input.actorId,
			decidedAt: new Date(),
			publicSummary: true,
		})
		.where(
			and(
				eq(grantExceptions.id, request.id),
				eq(grantExceptions.status, "pending"),
			),
		)
		.returning({ id: grantExceptions.id });
	if (!updated) {
		throw errors.conflict("This exception is already decided.", {
			reason: "closed",
		});
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "grant.exception_approved",
		targetType: "grant_exception",
		targetId: request.id,
		ipAddress: input.ip,
		metadata: { grantId: request.grantId },
	});
	return { id: request.id };
}

/** Turn the request down. It stays out of the public summary. */
export async function rejectException(
	database: RecoveryDb,
	input: { actorId: number; exceptionId: string; ip: string },
): Promise<{ id: string }> {
	const request = await pendingException(
		database,
		input.exceptionId,
		input.actorId,
	);
	const [updated] = await database
		.update(grantExceptions)
		.set({
			status: "rejected",
			decidedByUserId: input.actorId,
			decidedAt: new Date(),
			publicSummary: false,
		})
		.where(
			and(
				eq(grantExceptions.id, request.id),
				eq(grantExceptions.status, "pending"),
			),
		)
		.returning({ id: grantExceptions.id });
	if (!updated) {
		throw errors.conflict("This exception is already decided.", {
			reason: "closed",
		});
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "grant.exception_rejected",
		targetType: "grant_exception",
		targetId: request.id,
		ipAddress: input.ip,
		metadata: { grantId: request.grantId },
	});
	return { id: request.id };
}

/** Approved exceptions only. Names and serials stay off this list. */
export async function listPublicExceptions(
	database: RecoveryDb,
): Promise<PublicException[]> {
	const rows = await database
		.select({
			id: grantExceptions.id,
			reason: grantExceptions.reason,
			decidedAt: grantExceptions.decidedAt,
		})
		.from(grantExceptions)
		.where(
			and(
				eq(grantExceptions.status, "approved"),
				eq(grantExceptions.publicSummary, true),
			),
		)
		.orderBy(desc(grantExceptions.decidedAt))
		.limit(100);
	return rows.flatMap((row) => {
		if (!row.decidedAt) return [];
		return [
			{
				id: row.id,
				reason: row.reason,
				decidedAt: row.decidedAt.toISOString(),
			},
		];
	});
}
