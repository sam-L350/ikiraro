import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db";
import {
	centerStaff,
	roles,
	sessions,
	userRoles,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { hashPassword, verifyPassword } from "../auth/password";
import {
	isRoleCode,
	ROLE_CODES,
	ROLE_NAMES,
	type RoleCode,
} from "../authz/catalog";
import type { Assignment, ScopeType } from "../authz/decide";
import { assignedCenterIds, centerExists } from "../geography/centers";
import { insertUserWithPassport } from "./create-user";

type StaffDb = Pick<
	Database,
	"delete" | "insert" | "select" | "transaction" | "update"
>;

const CENTER_ROLES = ["trainer", "center_manager"] as const;

export function expectedScope(role: RoleCode): ScopeType {
	switch (role) {
		case "learner":
		case "mentor":
		case "public_verifier":
			return "self";
		case "trainer":
		case "center_manager":
			return "center";
		case "district_coordinator":
			return "district";
		case "content_author":
		case "content_reviewer":
		case "hardware_officer":
		case "committee_member":
		case "auditor":
		case "platform_admin":
			return "global";
		default: {
			const unreachable: never = role;
			return unreachable;
		}
	}
}

export function decideStaffGrant(input: {
	assignments: readonly Assignment[];
	centerIds: readonly string[];
	role: RoleCode;
	scopeType: ScopeType;
	scopeId: string;
}):
	| { ok: true; permission: "admin.manage" | "center.manage" }
	| { ok: false; reason: string } {
	if (input.role === "learner") {
		return { ok: false, reason: "Learners register themselves." };
	}
	if (input.scopeType !== expectedScope(input.role)) {
		return { ok: false, reason: "That role does not use this scope." };
	}
	if (
		(input.scopeType === "center" || input.scopeType === "district") &&
		input.scopeId.trim() === ""
	) {
		return { ok: false, reason: "Choose the place this role covers." };
	}
	if (input.scopeType === "global" && input.scopeId !== "global") {
		return { ok: false, reason: "That role does not use this scope." };
	}

	const admin = input.assignments.some(
		(assignment) =>
			assignment.role === "platform_admin" && assignment.scopeType === "global",
	);
	if (admin) return { ok: true, permission: "admin.manage" };

	const managesCenter = input.assignments.some(
		(assignment) =>
			assignment.role === "center_manager" && assignment.scopeType === "center",
	);
	const centerRole = (CENTER_ROLES as readonly string[]).includes(input.role);
	if (
		managesCenter &&
		input.centerIds.includes(input.scopeId) &&
		centerRole &&
		input.scopeType === "center"
	) {
		return { ok: true, permission: "center.manage" };
	}
	return { ok: false, reason: "You cannot assign that role." };
}

export async function readAssignments(
	database: Pick<Database, "select">,
	userId: number,
): Promise<Assignment[]> {
	const rows = await database
		.select({
			code: roles.code,
			scopeType: userRoles.scopeType,
			scopeId: userRoles.scopeId,
		})
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(eq(userRoles.userId, userId));
	return rows.flatMap((row) => {
		if (!isRoleCode(row.code) || !isScope(row.scopeType)) return [];
		return [
			{
				role: row.code,
				scopeType: row.scopeType,
				scopeId: row.scopeId,
			},
		];
	});
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

export type StaffContext = {
	mode: "admin" | "center" | "none";
	centers: string[];
	roles: { code: RoleCode; name: string; scopeType: ScopeType }[];
};

export async function loadStaffContext(
	database: Pick<Database, "select">,
	userId: number,
): Promise<StaffContext> {
	const assignments = await readAssignments(database, userId);
	const centerIds = await assignedCenterIds(database, userId, "center_manager");
	return staffContext(assignments, centerIds);
}

export function staffContext(
	assignments: readonly Assignment[],
	centerIds: readonly string[] = [],
): StaffContext {
	const admin = assignments.some(
		(assignment) =>
			assignment.role === "platform_admin" && assignment.scopeType === "global",
	);
	const managesCenter = assignments.some(
		(assignment) =>
			assignment.role === "center_manager" && assignment.scopeType === "center",
	);
	const centers = managesCenter ? [...centerIds] : [];
	if (admin) {
		return {
			mode: "admin",
			centers,
			roles: ROLE_CODES.filter((code) => code !== "learner").map((code) => ({
				code,
				name: ROLE_NAMES[code],
				scopeType: expectedScope(code),
			})),
		};
	}
	if (centers.length > 0) {
		return {
			mode: "center",
			centers,
			roles: CENTER_ROLES.map((code) => ({
				code,
				name: ROLE_NAMES[code],
				scopeType: "center" as const,
			})),
		};
	}
	return { mode: "none", centers: [], roles: [] };
}

function isUniqueViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if ("code" in error && error.code === "23505") return true;
	if ("cause" in error) return isUniqueViolation(error.cause);
	return false;
}

function cleanPassword(password: string): string {
	if (password.length < 8) {
		throw errors.badRequest("Use at least 8 characters.", {
			reason: "short_password",
		});
	}
	return password;
}

export async function createStaffAccount(
	database: StaffDb,
	input: {
		actorId: number;
		name: string;
		email: string;
		password: string;
		role: RoleCode;
		scopeType: ScopeType;
		scopeId: string;
		ip: string;
	},
): Promise<{
	id: number;
	email: string;
	name: string;
	mustChangePassword: true;
}> {
	const name = input.name.trim();
	const email = input.email.trim().toLowerCase();
	if (!name) {
		throw errors.badRequest("Enter a name.", { reason: "name_required" });
	}
	if (!email.includes("@")) {
		throw errors.badRequest("Enter an email address.", {
			reason: "email_required",
		});
	}
	const password = cleanPassword(input.password);
	const assignments = await readAssignments(database, input.actorId);
	const centerIds = await assignedCenterIds(
		database,
		input.actorId,
		"center_manager",
	);
	const gate = decideStaffGrant({
		assignments,
		centerIds,
		role: input.role,
		scopeType: input.scopeType,
		scopeId: input.scopeId.trim(),
	});
	if (!gate.ok) {
		throw errors.forbidden(gate.reason, { reason: "role_ceiling" });
	}
	const centerScope =
		input.scopeType === "center" &&
		(input.role === "trainer" || input.role === "center_manager");
	if (centerScope && !(await centerExists(database, input.scopeId.trim()))) {
		throw errors.badRequest("Choose a learning center.", {
			reason: "unknown_center",
		});
	}

	try {
		return await database.transaction(async (tx) => {
			const created = await insertUserWithPassport(tx, {
				email,
				name,
				createdByUserId: input.actorId,
				activatedAt: new Date(),
			});
			const scopeId =
				input.scopeType === "self"
					? String(created.userId)
					: input.scopeId.trim();
			await tx
				.update(users)
				.set({
					passwordHash: await hashPassword(password),
					mustChangePassword: true,
				})
				.where(eq(users.id, created.userId));
			const [role] = await tx
				.select({ id: roles.id })
				.from(roles)
				.where(eq(roles.code, input.role))
				.limit(1);
			if (!role) throw errors.internal("That role is not available yet.");
			await tx.insert(userRoles).values({
				userId: created.userId,
				roleId: role.id,
				scopeType: input.scopeType,
				scopeId,
			});
			if (centerScope) {
				await tx.insert(centerStaff).values({
					centerId: scopeId,
					userId: created.userId,
					role: input.role,
				});
			}
			await writeAudit(tx, {
				actorId: input.actorId,
				action: "staff.provisioned",
				targetType: "user",
				targetId: String(created.userId),
				ipAddress: input.ip,
				metadata: {
					role: input.role,
					scopeType: input.scopeType,
					scopeId,
				},
			});
			return {
				id: created.userId,
				email,
				name,
				mustChangePassword: true as const,
			};
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw errors.conflict("That email is already in use.", {
				reason: "email_taken",
			});
		}
		throw error;
	}
}

export type StaffRow = {
	id: number;
	name: string | null;
	email: string;
	deactivated: boolean;
	mustChangePassword: boolean;
	role: RoleCode;
	roleName: string;
	scopeType: string;
	scopeId: string | null;
};

export async function listStaff(
	database: Pick<Database, "select">,
	actorId: number,
): Promise<StaffRow[]> {
	const context = await loadStaffContext(database, actorId);
	if (context.mode === "none") return [];
	const rows = await database
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			deactivatedAt: users.deactivatedAt,
			mustChangePassword: users.mustChangePassword,
			role: roles.code,
			roleName: roles.name,
			scopeType: userRoles.scopeType,
			scopeId: userRoles.scopeId,
		})
		.from(users)
		.innerJoin(userRoles, eq(userRoles.userId, users.id))
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(isNull(users.deletedAt));
	return rows.flatMap((row) => {
		if (!isRoleCode(row.role) || row.role === "learner") return [];
		if (
			context.mode === "center" &&
			(row.scopeType !== "center" ||
				!row.scopeId ||
				!context.centers.includes(row.scopeId))
		) {
			return [];
		}
		return [
			{
				id: row.id,
				name: row.name,
				email: row.email,
				deactivated: row.deactivatedAt !== null,
				mustChangePassword: row.mustChangePassword,
				role: row.role,
				roleName: row.roleName,
				scopeType: row.scopeType,
				scopeId: row.scopeId,
			},
		];
	});
}

async function assertCanManage(
	database: Pick<Database, "select">,
	actorId: number,
	userId: number,
): Promise<void> {
	if (actorId === userId) {
		throw errors.badRequest("Use your own account settings for this.", {
			reason: "self",
		});
	}
	const target = await readAssignments(database, userId);
	const context = await loadStaffContext(database, actorId);
	if (context.mode === "admin") return;
	const onlyOwnCenter =
		context.mode === "center" &&
		target.length > 0 &&
		target.every(
			(assignment) =>
				assignment.scopeType === "center" &&
				assignment.scopeId !== null &&
				context.centers.includes(assignment.scopeId),
		);
	if (!onlyOwnCenter) {
		throw errors.forbidden("You cannot change that account.", {
			reason: "role_ceiling",
		});
	}
}

export async function deactivateStaff(
	database: StaffDb,
	input: { actorId: number; userId: number; ip: string },
): Promise<{ deactivated: true }> {
	await assertCanManage(database, input.actorId, input.userId);
	const [person] = await database
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.id, input.userId), isNull(users.deletedAt)))
		.limit(1);
	if (!person) throw errors.notFound("That account was not found.");
	await database.transaction(async (tx) => {
		await tx
			.update(users)
			.set({ deactivatedAt: new Date() })
			.where(eq(users.id, input.userId));
		await tx.delete(sessions).where(eq(sessions.userId, input.userId));
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "staff.deactivated",
			targetType: "user",
			targetId: String(input.userId),
			ipAddress: input.ip,
		});
	});
	return { deactivated: true };
}

export async function resetStaffPassword(
	database: StaffDb,
	input: { actorId: number; userId: number; password: string; ip: string },
): Promise<{ reset: true }> {
	const password = cleanPassword(input.password);
	await assertCanManage(database, input.actorId, input.userId);
	await database.transaction(async (tx) => {
		await tx
			.update(users)
			.set({
				passwordHash: await hashPassword(password),
				mustChangePassword: true,
			})
			.where(eq(users.id, input.userId));
		await tx.delete(sessions).where(eq(sessions.userId, input.userId));
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "staff.password_reset",
			targetType: "user",
			targetId: String(input.userId),
			ipAddress: input.ip,
		});
	});
	return { reset: true };
}

export async function changeOwnPassword(
	database: Pick<Database, "insert" | "select" | "update">,
	input: {
		userId: number;
		currentPassword: string;
		nextPassword: string;
		ip: string;
	},
): Promise<{ changed: true }> {
	const nextPassword = cleanPassword(input.nextPassword);
	if (nextPassword === input.currentPassword) {
		throw errors.badRequest("Choose a different password.", {
			reason: "same_password",
		});
	}
	const [person] = await database
		.select({ passwordHash: users.passwordHash })
		.from(users)
		.where(eq(users.id, input.userId))
		.limit(1);
	const valid = person?.passwordHash
		? await verifyPassword(input.currentPassword, person.passwordHash)
		: false;
	if (!valid) {
		throw errors.badRequest("The current password is wrong.", {
			reason: "wrong_password",
		});
	}
	await database
		.update(users)
		.set({
			passwordHash: await hashPassword(nextPassword),
			mustChangePassword: false,
		})
		.where(eq(users.id, input.userId));
	await writeAudit(database, {
		actorId: input.userId,
		action: "auth.password_changed",
		targetType: "user",
		targetId: String(input.userId),
		ipAddress: input.ip,
	});
	return { changed: true };
}
