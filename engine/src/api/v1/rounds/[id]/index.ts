import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import { ROLE_PERMISSIONS } from "../../../../core/authz/catalog";
import { type RoundDetail, readRound } from "../../../../core/hardware/rounds";
import { db } from "../../../../db";

/** One round and the applications stored on it. */
export async function getRound(input: { id: string }): Promise<RoundDetail> {
	const user = await requireAuth();
	const assignments = await loadAssignments(user.id);
	const admin = assignments.some((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes("admin.manage"),
	);
	const district = assignments.find(
		(assignment) =>
			assignment.scopeType === "district" &&
			ROLE_PERMISSIONS[assignment.role].includes("district.manage"),
	);
	if (!admin && !district?.scopeId) {
		throw errors.forbidden("A coordinator opens a round for their district.");
	}
	const round = await readRound(db, input.id);
	if (!admin && district?.scopeId !== round.districtId) {
		throw errors.forbidden("A coordinator opens a round for their district.");
	}
	return round;
}
