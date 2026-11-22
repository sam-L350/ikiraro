import { eq } from "drizzle-orm";
import { requireAuth } from "../../../../core/auth/require-auth";
import { isRoleCode, type RoleCode } from "../../../../core/authz/catalog";
import { db } from "../../../../db";
import { roles, userRoles } from "../../../../db/schema";

export type MeResponse = {
	id: number;
	email: string;
	name: string | null;
	picture: string | null;
	createdAt: Date;
	roles: { code: RoleCode; name: string }[];
};

/** Profile of the signed-in user. */
export async function getAuthMe(): Promise<MeResponse> {
	const user = await requireAuth();
	const assignments = await db
		.select({ code: roles.code, name: roles.name })
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(eq(userRoles.userId, user.id));

	return {
		id: user.id,
		email: user.email,
		name: user.name,
		picture: user.picture,
		createdAt: user.createdAt,
		roles: assignments.flatMap((row) =>
			isRoleCode(row.code) ? [{ code: row.code, name: row.name }] : [],
		),
	};
}
