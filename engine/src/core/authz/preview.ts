import { eq } from "drizzle-orm";
import { env } from "../../config/env";
import { db } from "../../db";
import { roles, userRoles } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { ROLE_NAMES, type RoleCode } from "./catalog";
import type { ScopeType } from "./decide";

/** Stable scope ids for the builder preview. Real centers arrive in phase 1.7. */
export const PREVIEW_CENTER_ID = "dev-center";
export const PREVIEW_DISTRICT_ID = "dev-district";

export function previewAssignment(
	role: RoleCode,
	userId: number,
): { scopeType: ScopeType; scopeId: string } {
	switch (role) {
		case "learner":
		case "mentor":
		case "public_verifier":
			return { scopeType: "self", scopeId: String(userId) };
		case "trainer":
		case "center_manager":
			return { scopeType: "center", scopeId: PREVIEW_CENTER_ID };
		case "district_coordinator":
			return { scopeType: "district", scopeId: PREVIEW_DISTRICT_ID };
		case "content_author":
		case "content_reviewer":
		case "hardware_officer":
		case "committee_member":
		case "auditor":
		case "platform_admin":
			return { scopeType: "global", scopeId: "global" };
		default: {
			const unreachable: never = role;
			return unreachable;
		}
	}
}

/**
 * Replace every role on this user with one preview role.
 * Refuses when the switch is off, which includes every production process.
 */
export async function assumePreviewRole(
	userId: number,
	role: RoleCode,
): Promise<{ role: RoleCode; name: string }> {
	if (!env.devRoleSwitch) throw errors.notFound();

	const assignment = previewAssignment(role, userId);
	const [roleRow] = await db
		.select({ id: roles.id })
		.from(roles)
		.where(eq(roles.code, role))
		.limit(1);
	if (!roleRow) throw errors.badRequest("That role is not available yet");

	await db.transaction(async (tx) => {
		await tx.delete(userRoles).where(eq(userRoles.userId, userId));
		await tx.insert(userRoles).values({
			userId,
			roleId: roleRow.id,
			scopeType: assignment.scopeType,
			scopeId: assignment.scopeId,
		});
		await writeAudit(tx, {
			actorId: userId,
			action: "dev.role_assumed",
			targetType: "user",
			targetId: String(userId),
			metadata: {
				role,
				scopeType: assignment.scopeType,
				scopeId: assignment.scopeId,
			},
		});
	});

	return { role, name: ROLE_NAMES[role] };
}
