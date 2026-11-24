import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import type { PermissionCode } from "../../../../core/authz/catalog";
import { ROLE_PERMISSIONS } from "../../../../core/authz/catalog";
import type { Assignment } from "../../../../core/authz/decide";
import {
	type EvidenceQueueRow,
	listEvidenceQueue,
	listReviewQueue,
	type ReviewQueueRow,
} from "../../../../core/hardware/follow-ups";
import { db } from "../../../../db";

function holds(
	assignments: readonly Assignment[],
	permission: PermissionCode,
): boolean {
	return assignments.some((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes(permission),
	);
}

function scopedIds(
	assignments: readonly Assignment[],
	permission: PermissionCode,
	scope: "center" | "district",
): string[] | null {
	const global = assignments.some(
		(assignment) =>
			assignment.scopeType === "global" &&
			ROLE_PERMISSIONS[assignment.role].includes(permission),
	);
	if (global) return null;
	return assignments.flatMap((assignment) => {
		if (assignment.scopeType !== scope || !assignment.scopeId) return [];
		if (!ROLE_PERMISSIONS[assignment.role].includes(permission)) return [];
		return [assignment.scopeId];
	});
}

/** Usage evidence for a trainer, and unanswered check-ins for a coordinator. */
export async function getFollowUpQueue(): Promise<{
	evidence: EvidenceQueueRow[];
	reviews: ReviewQueueRow[];
}> {
	const user = await requireAuth();
	const assignments = await loadAssignments(user.id);
	const evidence = holds(assignments, "submission.review");
	const reviews =
		holds(assignments, "district.manage") ||
		holds(assignments, "hardware.manage");
	if (!evidence && !reviews) {
		throw errors.forbidden("A trainer or a coordinator reads follow-ups.", {
			reason: "scope",
		});
	}
	const reviewScope = holds(assignments, "hardware.manage")
		? scopedIds(assignments, "hardware.manage", "district")
		: scopedIds(assignments, "district.manage", "district");
	return {
		evidence: evidence
			? await listEvidenceQueue(
					db,
					scopedIds(assignments, "submission.review", "center"),
				)
			: [],
		reviews: reviews ? await listReviewQueue(db, reviewScope) : [],
	};
}
