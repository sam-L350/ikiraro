import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import type { RoleCode } from "../../../../core/authz/catalog";
import type { ScopeType } from "../../../../core/authz/decide";
import { clientIp } from "../../../../core/http/client-ip";
import {
	createStaffAccount,
	decideStaffGrant,
	readAssignments,
} from "../../../../core/identity/staff";
import { db } from "../../../../db";

/** Create a staff account. The temporary password must be changed at first sign-in. */
export async function createStaffUser(input: {
	name: string;
	email: string;
	password: string;
	role: RoleCode;
	scopeType: ScopeType;
	scopeId: string;
}): Promise<{
	id: number;
	email: string;
	name: string;
	mustChangePassword: true;
}> {
	const user = await requireAuth();
	const gate = decideStaffGrant({
		assignments: await readAssignments(db, user.id),
		role: input.role,
		scopeType: input.scopeType,
		scopeId: input.scopeId,
	});
	if (!gate.ok) {
		throw errors.forbidden(gate.reason, { reason: "role_ceiling" });
	}
	await authorize({
		permission: gate.permission,
		resource:
			gate.permission === "center.manage"
				? { centerId: input.scopeId.trim() }
				: {},
	});
	return createStaffAccount(db, {
		actorId: user.id,
		name: input.name,
		email: input.email,
		password: input.password,
		role: input.role,
		scopeType: input.scopeType,
		scopeId: input.scopeId,
		ip: clientIp(),
	});
}
