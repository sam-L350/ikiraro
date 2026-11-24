import { errors } from "../../../core/api/error";
import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import {
	type PermissionCode,
	ROLE_PERMISSIONS,
} from "../../../core/authz/catalog";
import type { Assignment } from "../../../core/authz/decide";
import {
	type DormancyRow,
	listDormancy,
} from "../../../core/hardware/dormancy";
import { db } from "../../../db";

function holds(
	assignments: readonly Assignment[],
	permission: PermissionCode,
): boolean {
	return assignments.some((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes(permission),
	);
}

/** Recipients who stopped answering or stopped practicing, in this district. */
export async function getDormancy(): Promise<{ items: DormancyRow[] }> {
	const user = await requireAuth();
	const assignments = await loadAssignments(user.id);
	const district = holds(assignments, "district.manage");
	const admin = holds(assignments, "admin.manage");
	if (!district && !admin) {
		throw errors.forbidden("The district coordinator receives this alert.", {
			reason: "scope",
		});
	}
	const global = assignments.some(
		(assignment) =>
			assignment.scopeType === "global" &&
			ROLE_PERMISSIONS[assignment.role].includes("admin.manage"),
	);
	const districtIds = global
		? null
		: assignments.flatMap((assignment) => {
				if (assignment.scopeType !== "district" || !assignment.scopeId)
					return [];
				if (!ROLE_PERMISSIONS[assignment.role].includes("district.manage"))
					return [];
				return [assignment.scopeId];
			});
	return { items: await listDormancy(db, districtIds) };
}
