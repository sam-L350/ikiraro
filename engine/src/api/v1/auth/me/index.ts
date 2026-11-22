import { eq } from "drizzle-orm";
import { getRequestContext } from "../../../../core/api/context";
import { requireAuth } from "../../../../core/auth/require-auth";
import {
	getSessionTokenFromRequest,
	listSessions,
} from "../../../../core/auth/sessions";
import { readSharedIdleMs } from "../../../../core/auth/shared-idle";
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
	sharedDevice: boolean;
	idleTimeoutMs: number | null;
};

/** Profile of the signed-in user. */
export async function getAuthMe(): Promise<MeResponse> {
	const user = await requireAuth();
	const assignments = await db
		.select({ code: roles.code, name: roles.name })
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(eq(userRoles.userId, user.id));

	const token = getSessionTokenFromRequest(getRequestContext().request) ?? "";
	const open = token ? await listSessions(db, { userId: user.id, token }) : [];
	const current = open.find((row) => row.current);
	const sharedDevice = current?.sharedDevice === true;

	return {
		id: user.id,
		email: user.email,
		name: user.name,
		picture: user.picture,
		createdAt: user.createdAt,
		roles: assignments.flatMap((row) =>
			isRoleCode(row.code) ? [{ code: row.code, name: row.name }] : [],
		),
		sharedDevice,
		idleTimeoutMs: sharedDevice ? await readSharedIdleMs(db) : null,
	};
}
