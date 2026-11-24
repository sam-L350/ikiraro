import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	adminApprovals,
	centerStaff,
	districts,
	learningCenters,
	roles,
	userRoles,
	users,
} from "../../db/schema";
import type { JsonValue } from "../../db/schema/compliance";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { isRoleCode, type RoleCode } from "../authz/catalog";
import type { ScopeType } from "../authz/decide";
import { centerExists } from "../geography/centers";
import { expectedScope } from "../identity/staff";

const REASON_LIMIT = 400;
/** Storage bound for one request. Not an allocation quota. */
const CHANGE_LIMIT = 50;

type ApprovalDb = Pick<
	Database,
	"insert" | "select" | "transaction" | "update"
>;

export type RoleChangeInput = {
	email: string;
	role: string;
	scopeType: string;
	scopeId: string;
};

type StoredChange = {
	userId: number;
	name: string;
	email: string;
	role: RoleCode;
	scopeType: ScopeType;
	scopeId: string;
};

export type ApprovalView = {
	id: string;
	reason: string;
	changes: StoredChange[];
	requestedByName: string;
	mine: boolean;
	status: "pending" | "approved" | "declined";
	createdAt: string;
};

const CENTER_STAFF = ["trainer", "center_manager"] as const;

function cleanText(value: string, empty: string, reason: string): string {
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > REASON_LIMIT) {
		throw errors.badRequest(empty, { reason });
	}
	return trimmed;
}

function isScope(value: string): value is ScopeType {
	switch (value) {
		case "self":
		case "center":
		case "district":
		case "global":
			return true;
		default:
			return false;
	}
}

function isStatus(value: string): value is ApprovalView["status"] {
	switch (value) {
		case "pending":
		case "approved":
		case "declined":
			return true;
		default:
			return false;
	}
}

async function assertAdmin(
	database: Pick<Database, "select">,
	userId: number,
): Promise<void> {
	const rows = await database
		.select({ code: roles.code, scopeType: userRoles.scopeType })
		.from(userRoles)
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(and(eq(userRoles.userId, userId), isNull(userRoles.suspendedAt)));
	const admin = rows.some(
		(row) => row.code === "platform_admin" && row.scopeType === "global",
	);
	if (!admin) {
		throw errors.forbidden("A platform admin proposes a role change.", {
			reason: "scope",
		});
	}
}

async function resolveChange(
	database: Pick<Database, "select">,
	input: RoleChangeInput,
): Promise<StoredChange> {
	const email = input.email.trim().toLowerCase();
	if (!email.includes("@")) {
		throw errors.badRequest("Enter the person's email.", { reason: "email" });
	}
	if (!isRoleCode(input.role) || input.role === "learner") {
		throw errors.badRequest("Choose a role.", { reason: "role" });
	}
	if (
		!isScope(input.scopeType) ||
		expectedScope(input.role) !== input.scopeType
	) {
		throw errors.badRequest("That role does not use this scope.", {
			reason: "scope",
		});
	}
	const [person] = await database
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			deletedAt: users.deletedAt,
			deactivatedAt: users.deactivatedAt,
		})
		.from(users)
		.where(sql`lower(${users.email}) = ${email}`)
		.limit(1);
	if (!person || person.deletedAt || person.deactivatedAt) {
		throw errors.notFound("That person was not found.");
	}
	let scopeId = input.scopeId.trim();
	if (input.scopeType === "self") scopeId = String(person.id);
	if (input.scopeType === "global") {
		if (scopeId !== "global") {
			throw errors.badRequest("That role does not use this scope.", {
				reason: "scope",
			});
		}
	}
	if (input.scopeType === "center") {
		if (!(await centerExists(database, scopeId))) {
			throw errors.badRequest("Choose a learning center.", {
				reason: "center",
			});
		}
	}
	if (input.scopeType === "district") {
		const [district] = await database
			.select({ id: districts.id })
			.from(districts)
			.where(eq(districts.id, scopeId))
			.limit(1);
		if (!district) {
			throw errors.badRequest("Choose a district.", { reason: "district" });
		}
	}
	const name = person.name?.trim();
	return {
		userId: person.id,
		name: name ? name : person.email,
		email: person.email,
		role: input.role,
		scopeType: input.scopeType,
		scopeId,
	};
}

function readChanges(value: JsonValue): StoredChange[] {
	if (!Array.isArray(value)) return [];
	const changes: StoredChange[] = [];
	for (const item of value) {
		if (typeof item !== "object" || item === null || Array.isArray(item)) {
			continue;
		}
		const row = item as Record<string, JsonValue>;
		const role = row.role;
		const scopeType = row.scopeType;
		if (
			typeof row.userId !== "number" ||
			typeof row.name !== "string" ||
			typeof row.email !== "string" ||
			typeof role !== "string" ||
			!isRoleCode(role) ||
			typeof scopeType !== "string" ||
			!isScope(scopeType) ||
			typeof row.scopeId !== "string"
		) {
			continue;
		}
		changes.push({
			userId: row.userId,
			name: row.name,
			email: row.email,
			role,
			scopeType,
			scopeId: row.scopeId,
		});
	}
	return changes;
}

/** Ask a different admin to add these roles. Nothing is granted yet. */
export async function requestRoleChange(
	database: ApprovalDb,
	input: {
		actorId: number;
		reason: string;
		changes: RoleChangeInput[];
		ip: string;
	},
): Promise<{ id: string }> {
	await assertAdmin(database, input.actorId);
	const reason = cleanText(
		input.reason,
		"Write why this change is needed.",
		"reason",
	);
	if (input.changes.length < 2 || input.changes.length > CHANGE_LIMIT) {
		throw errors.badRequest(
			input.changes.length < 2
				? "Name at least two people."
				: "Name at most 50 people in one change.",
			{ reason: "count" },
		);
	}
	const resolved: StoredChange[] = [];
	const seen = new Set<string>();
	for (const change of input.changes) {
		const row = await resolveChange(database, change);
		const key = `${row.userId}:${row.role}:${row.scopeType}:${row.scopeId}`;
		if (seen.has(key)) {
			throw errors.badRequest("Name each role once.", { reason: "duplicate" });
		}
		seen.add(key);
		resolved.push(row);
	}
	const [created] = await database
		.insert(adminApprovals)
		.values({
			reason,
			changes: resolved,
			requestedByUserId: input.actorId,
		})
		.returning({ id: adminApprovals.id });
	if (!created) throw errors.internal("The request could not be stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "admin_approval.requested",
		targetType: "admin_approval",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: { count: resolved.length },
	});
	return { id: created.id };
}

/** Role changes waiting for a second admin. */
export async function listRoleChanges(
	database: Pick<Database, "select">,
	actorId: number,
): Promise<ApprovalView[]> {
	await assertAdmin(database, actorId);
	const rows = await database
		.select({
			id: adminApprovals.id,
			reason: adminApprovals.reason,
			changes: adminApprovals.changes,
			status: adminApprovals.status,
			createdAt: adminApprovals.createdAt,
			requestedByUserId: adminApprovals.requestedByUserId,
			requestedByName: users.name,
		})
		.from(adminApprovals)
		.innerJoin(users, eq(users.id, adminApprovals.requestedByUserId))
		.orderBy(desc(adminApprovals.createdAt))
		.limit(100);
	return rows.flatMap((row) => {
		if (!isStatus(row.status)) return [];
		const name = row.requestedByName?.trim();
		return [
			{
				id: row.id,
				reason: row.reason,
				changes: readChanges(row.changes),
				requestedByName: name ? name : "Admin",
				mine: row.requestedByUserId === actorId,
				status: row.status,
				createdAt: row.createdAt.toISOString(),
			},
		];
	});
}

async function pending(
	database: Pick<Database, "select">,
	id: string,
): Promise<{
	id: string;
	requestedByUserId: number;
	changes: JsonValue;
}> {
	const [row] = await database
		.select({
			id: adminApprovals.id,
			requestedByUserId: adminApprovals.requestedByUserId,
			changes: adminApprovals.changes,
			status: adminApprovals.status,
		})
		.from(adminApprovals)
		.where(eq(adminApprovals.id, id))
		.limit(1);
	if (!row) throw errors.notFound("That request was not found.");
	if (row.status !== "pending") {
		throw errors.conflict("This request is already decided.", {
			reason: "closed",
		});
	}
	return row;
}

/** A different admin adds the roles. */
export async function approveRoleChange(
	database: ApprovalDb,
	input: { actorId: number; approvalId: string; ip: string },
): Promise<{ id: string }> {
	await assertAdmin(database, input.actorId);
	const row = await pending(database, input.approvalId);
	if (row.requestedByUserId === input.actorId) {
		throw errors.forbidden("A different admin approves this change.", {
			reason: "self",
		});
	}
	const changes = readChanges(row.changes);
	await database.transaction(async (tx) => {
		for (const change of changes) {
			const [role] = await tx
				.select({ id: roles.id })
				.from(roles)
				.where(eq(roles.code, change.role))
				.limit(1);
			if (!role) throw errors.internal("That role is not available yet.");
			await tx
				.insert(userRoles)
				.values({
					userId: change.userId,
					roleId: role.id,
					scopeType: change.scopeType,
					scopeId: change.scopeId,
				})
				.onConflictDoNothing();
			if (
				change.scopeType === "center" &&
				(CENTER_STAFF as readonly string[]).includes(change.role)
			) {
				const [center] = await tx
					.select({ id: learningCenters.id })
					.from(learningCenters)
					.where(eq(learningCenters.id, change.scopeId))
					.limit(1);
				if (!center) {
					throw errors.badRequest("Choose a learning center.", {
						reason: "center",
					});
				}
				await tx
					.insert(centerStaff)
					.values({
						centerId: change.scopeId,
						userId: change.userId,
						role: change.role,
					})
					.onConflictDoNothing();
			}
		}
		const [updated] = await tx
			.update(adminApprovals)
			.set({
				status: "approved",
				decidedByUserId: input.actorId,
				decidedAt: new Date(),
			})
			.where(
				and(
					eq(adminApprovals.id, row.id),
					eq(adminApprovals.status, "pending"),
				),
			)
			.returning({ id: adminApprovals.id });
		if (!updated) {
			throw errors.conflict("This request is already decided.", {
				reason: "closed",
			});
		}
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "admin_approval.approved",
			targetType: "admin_approval",
			targetId: row.id,
			ipAddress: input.ip,
			metadata: { count: changes.length },
		});
	});
	return { id: row.id };
}

/** A different admin refuses the change. No role is added. */
export async function declineRoleChange(
	database: ApprovalDb,
	input: { actorId: number; approvalId: string; note: string; ip: string },
): Promise<{ id: string }> {
	await assertAdmin(database, input.actorId);
	const note = cleanText(
		input.note,
		"Write why you are refusing this change.",
		"note",
	);
	const row = await pending(database, input.approvalId);
	if (row.requestedByUserId === input.actorId) {
		throw errors.forbidden("A different admin approves this change.", {
			reason: "self",
		});
	}
	const [updated] = await database
		.update(adminApprovals)
		.set({
			status: "declined",
			decidedByUserId: input.actorId,
			decisionNote: note,
			decidedAt: new Date(),
		})
		.where(
			and(eq(adminApprovals.id, row.id), eq(adminApprovals.status, "pending")),
		)
		.returning({ id: adminApprovals.id });
	if (!updated) {
		throw errors.conflict("This request is already decided.", {
			reason: "closed",
		});
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "admin_approval.declined",
		targetType: "admin_approval",
		targetId: row.id,
		ipAddress: input.ip,
		metadata: { count: readChanges(row.changes).length },
	});
	return { id: row.id };
}
