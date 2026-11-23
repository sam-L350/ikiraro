import {
	type PermissionCode,
	ROLE_PERMISSIONS,
	type RoleCode,
} from "./catalog";

export type ScopeType = "self" | "center" | "district" | "global";

export type Assignment = {
	role: RoleCode;
	scopeType: ScopeType;
	scopeId: string | null;
};

export type Resource = {
	ownerId?: string;
	centerId?: string;
	districtId?: string;
};

export type AccessDecision = { ok: true } | { ok: false; reason: string };

function scopeMatches(
	assignment: Assignment,
	actorId: string,
	resource: Resource,
): boolean {
	switch (assignment.scopeType) {
		case "global":
			return true;
		case "self":
			return resource.ownerId === actorId;
		case "center":
			return (
				assignment.scopeId !== null && assignment.scopeId === resource.centerId
			);
		case "district":
			return (
				assignment.scopeId !== null &&
				assignment.scopeId === resource.districtId
			);
		default: {
			const unreachable: never = assignment.scopeType;
			return unreachable;
		}
	}
}

/**
 * Pure permission check. Handlers call `authorize()`, which loads assignments
 * and then uses this function. A user may hold several roles.
 */
export function decideAccess(input: {
	actorId: string;
	assignments: readonly Assignment[];
	permission: PermissionCode;
	resource: Resource;
}): AccessDecision {
	const holders = input.assignments.filter((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes(input.permission),
	);
	if (holders.length === 0) {
		return { ok: false, reason: "You do not have this permission" };
	}
	// The published catalog is the same shelf for every center. Scope applies when enrolling.
	if (input.permission === "learning.read") {
		return { ok: true };
	}
	// A center-scoped trainer still has a profile of their own. Self permissions
	// follow the resource owner, not the job scope.
	if (
		input.permission === "profile.read.self" ||
		input.permission === "profile.write.self"
	) {
		return input.resource.ownerId === input.actorId
			? { ok: true }
			: { ok: false, reason: "This action is outside your scope" };
	}
	const allowed = holders.some((assignment) =>
		scopeMatches(assignment, input.actorId, input.resource),
	);
	if (!allowed) {
		return { ok: false, reason: "This action is outside your scope" };
	}
	return { ok: true };
}
