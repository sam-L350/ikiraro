import { requireAuth } from "../../../../core/auth/require-auth";
import type { RoleCode } from "../../../../core/authz/catalog";
import { assumePreviewRole } from "../../../../core/authz/preview";

/**
 * Development only. Replace the signed-in user's roles with one preview role.
 * The handler requires a session and does not call authorize(), because the
 * builder may hold no role yet. It returns 404 when the switch is off,
 * including every production process.
 */
export async function updateDevRole(input: {
	role: RoleCode;
}): Promise<{ role: RoleCode; name: string }> {
	const user = await requireAuth();
	return assumePreviewRole(user.id, input.role);
}
