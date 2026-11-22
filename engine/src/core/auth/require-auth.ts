import type { User } from "../../db/schema";
import { getRequestContext } from "../api/context";
import { errors } from "../api/error";

/**
 * Returns the authenticated user or throws a 401.
 *
 * ```ts
 * export async function getSecret() {
 *   const user = await requireAuth();
 *   return { hello: user.email };
 * }
 * ```
 */
const PASSWORD_CHANGE_ROUTES = new Set([
	"/api/v1/auth/me",
	"/api/v1/auth/logout",
	"/api/v1/auth/password",
]);

/** Routes a staff member may call before replacing a temporary password. */
export function allowsPasswordChange(pathname: string): boolean {
	return PASSWORD_CHANGE_ROUTES.has(pathname);
}

export async function requireAuth(): Promise<User> {
	const context = getRequestContext();
	const user = await context.user();
	if (!user || user.deletedAt || user.deactivatedAt)
		throw errors.unauthorized();
	if (user.mustChangePassword && !allowsPasswordChange(context.url.pathname)) {
		throw errors.forbidden("Change the temporary password before continuing.", {
			reason: "password_change_required",
		});
	}
	return user;
}

/** Returns the authenticated user, or `null` for anonymous requests. */
export async function getUser(): Promise<User | null> {
	return getRequestContext().user();
}
