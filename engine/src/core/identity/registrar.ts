import { eq } from "drizzle-orm";
import type { Database } from "../../db";
import { roles, userRoles, users } from "../../db/schema";
import { errors } from "../api/error";
import { isRoleCode, type RoleCode } from "../authz/catalog";

function isRegistrar(code: RoleCode): boolean {
	switch (code) {
		case "trainer":
		case "center_manager":
		case "platform_admin":
			return true;
		case "learner":
		case "district_coordinator":
		case "content_author":
		case "content_reviewer":
		case "hardware_officer":
		case "committee_member":
		case "auditor":
		case "mentor":
		case "public_verifier":
			return false;
		default: {
			const unreachable: never = code;
			return unreachable;
		}
	}
}

/** A trainer, center manager, or platform admin may register a learner. */
export async function requireRegistrar(
	database: Pick<Database, "select">,
	userId: number,
): Promise<{ id: number; name: string | null }> {
	const [person] = await database
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!person) throw errors.unauthorized();

	const assignments = await database
		.select({ code: roles.code })
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(eq(userRoles.userId, userId));
	const allowed = assignments.some(
		(row) => isRoleCode(row.code) && isRegistrar(row.code),
	);
	if (!allowed) {
		throw errors.forbidden("Only a trainer can register a learner.");
	}
	return person;
}
