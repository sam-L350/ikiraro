import { ROLE_PERMISSIONS } from "../authz/catalog";
import type { Assignment } from "../authz/decide";

/** Whose audit rows this viewer may read. */
export type AuditScope =
	| { kind: "all" }
	| { kind: "limited"; centerIds: string[]; districtIds: string[] };

/**
 * A global auditor or admin sees the whole log.
 * A center or district role sees only the places they cover.
 */
export function auditScope(assignments: readonly Assignment[]): AuditScope {
	const centerIds = new Set<string>();
	const districtIds = new Set<string>();
	let all = false;
	for (const assignment of assignments) {
		if (!ROLE_PERMISSIONS[assignment.role].includes("audit.read")) continue;
		switch (assignment.scopeType) {
			case "global":
				all = true;
				break;
			case "center":
				if (assignment.scopeId) centerIds.add(assignment.scopeId);
				break;
			case "district":
				if (assignment.scopeId) districtIds.add(assignment.scopeId);
				break;
			case "self":
				break;
			default: {
				const unreachable: never = assignment.scopeType;
				return unreachable;
			}
		}
	}
	if (all) return { kind: "all" };
	return {
		kind: "limited",
		centerIds: [...centerIds],
		districtIds: [...districtIds],
	};
}
