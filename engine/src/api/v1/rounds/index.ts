import { errors } from "../../../core/api/error";
import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import { ROLE_PERMISSIONS } from "../../../core/authz/catalog";
import {
	type AllocationRound,
	listRounds,
} from "../../../core/hardware/rounds";
import { db } from "../../../db";

/** Rounds in this coordinator's district, or every district for an admin. */
export async function getRounds(): Promise<{
	rounds: AllocationRound[];
	districts: { id: string; name: string }[];
}> {
	const user = await requireAuth();
	const assignments = await loadAssignments(user.id);
	const admin = assignments.some((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes("admin.manage"),
	);
	if (admin) return listRounds(db, {});
	const district = assignments.find(
		(assignment) =>
			assignment.scopeType === "district" &&
			ROLE_PERMISSIONS[assignment.role].includes("district.manage"),
	);
	if (!district?.scopeId) {
		throw errors.forbidden("A coordinator opens a round for their district.");
	}
	return listRounds(db, { districtId: district.scopeId });
}
