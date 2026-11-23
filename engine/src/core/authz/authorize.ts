import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { roles, userRoles } from "../../db/schema";
import { errors } from "../api/error";
import { requireAuth } from "../auth/require-auth";
import {
	centerStaffByRole,
	expandCenterAssignments,
} from "../geography/centers";
import { isRoleCode, type PermissionCode } from "./catalog";
import { decideAccess, type Resource, type ScopeType } from "./decide";

function isScopeType(value: string): value is ScopeType {
	return (
		value === "self" ||
		value === "center" ||
		value === "district" ||
		value === "global"
	);
}

/**
 * Enforces a permission for the signed-in user. Call this at the start of
 * every handler that is not explicitly public.
 */
export async function authorize(input: {
	permission: PermissionCode;
	resource?: Resource;
}): Promise<void> {
	const user = await requireAuth();
	const rows = await db
		.select({
			code: roles.code,
			scopeType: userRoles.scopeType,
			scopeId: userRoles.scopeId,
		})
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(and(eq(userRoles.userId, user.id), isNull(userRoles.suspendedAt)));

	const stored = rows.flatMap((row) => {
		if (!isRoleCode(row.code) || !isScopeType(row.scopeType)) return [];
		return [
			{
				role: row.code,
				scopeType: row.scopeType,
				scopeId: row.scopeId,
			},
		];
	});
	const assignments = expandCenterAssignments(
		stored,
		await centerStaffByRole(db, user.id),
	);

	const decision = decideAccess({
		actorId: String(user.id),
		assignments,
		permission: input.permission,
		resource: input.resource ?? { ownerId: String(user.id) },
	});
	if (!decision.ok) throw errors.forbidden(decision.reason);
}
