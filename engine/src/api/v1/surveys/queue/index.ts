import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import {
	type PermissionCode,
	ROLE_PERMISSIONS,
} from "../../../../core/authz/catalog";
import type { Assignment } from "../../../../core/authz/decide";
import {
	listSurveyQueue,
	type SurveyQueueRow,
} from "../../../../core/hardware/surveys";
import { db } from "../../../../db";

function holds(
	assignments: readonly Assignment[],
	permission: PermissionCode,
): boolean {
	return assignments.some((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes(permission),
	);
}

/** Surveys a trainer at the learner's center has not confirmed. */
export async function getSurveyQueue(): Promise<{ items: SurveyQueueRow[] }> {
	const user = await requireAuth();
	const assignments = await loadAssignments(user.id);
	if (!holds(assignments, "submission.review")) {
		throw errors.forbidden("A trainer confirms a survey.", { reason: "scope" });
	}
	const global = assignments.some(
		(assignment) =>
			assignment.scopeType === "global" &&
			ROLE_PERMISSIONS[assignment.role].includes("submission.review"),
	);
	const centerIds = global
		? null
		: assignments.flatMap((assignment) => {
				if (assignment.scopeType !== "center" || !assignment.scopeId) return [];
				if (!ROLE_PERMISSIONS[assignment.role].includes("submission.review"))
					return [];
				return [assignment.scopeId];
			});
	return { items: await listSurveyQueue(db, centerIds) };
}
