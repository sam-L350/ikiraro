import { and, eq, lt } from "drizzle-orm";
import { env } from "../../config/env";
import { type Database, db } from "../../db";
import { sessions, type User, users } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { parseCookies, serializeCookie } from "../http/cookies";
import { readSharedIdleMs } from "./shared-idle";

type SessionDb = Pick<Database, "delete" | "insert" | "select" | "update">;

export const SESSION_COOKIE = "session";

const TOKEN_PREFIX = "session_";

/**
 * Sessions are stored by the SHA-256 hash of the token. A leaked database
 * dump therefore cannot be replayed as valid cookies.
 */
async function hashToken(token: string): Promise<string> {
	const data = new TextEncoder().encode(token);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function randomToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	const hex = Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `${TOKEN_PREFIX}${hex}`;
}

export async function createSession(
	userId: number,
	database: Pick<Database, "insert" | "select"> = db,
	options: { sharedDevice?: boolean } = {},
): Promise<string> {
	const token = randomToken();
	const sharedDevice = options.sharedDevice === true;
	const lifetime = sharedDevice
		? await readSharedIdleMs(database)
		: env.sessionTtlMs;
	const expiresAt = new Date(Date.now() + lifetime);

	await database.insert(sessions).values({
		id: await hashToken(token),
		userId,
		expiresAt,
		sharedDevice,
	});

	return token;
}

export type ValidatedSession = {
	user: User;
	expiresAt: Date;
};

/**
 * Resolve a session token to its user. Expired sessions are deleted.
 * Sessions past the halfway point of their lifetime are silently extended
 * (sliding expiration) so active users are never logged out.
 */
export async function validateSession(
	token: string,
	database: SessionDb = db,
): Promise<ValidatedSession | null> {
	if (!token.startsWith(TOKEN_PREFIX)) return null;

	const id = await hashToken(token);
	const [row] = await database
		.select({
			expiresAt: sessions.expiresAt,
			sharedDevice: sessions.sharedDevice,
			user: users,
		})
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.id, id))
		.limit(1);

	if (!row) return null;

	const now = Date.now();
	if (row.expiresAt.getTime() <= now) {
		await database.delete(sessions).where(eq(sessions.id, id));
		return null;
	}

	let expiresAt = row.expiresAt;
	if (row.sharedDevice) {
		const idle = await readSharedIdleMs(database);
		expiresAt = new Date(now + idle);
		await database
			.update(sessions)
			.set({ expiresAt })
			.where(eq(sessions.id, id));
	} else if (row.expiresAt.getTime() - now < env.sessionTtlMs / 2) {
		expiresAt = new Date(now + env.sessionTtlMs);
		await database
			.update(sessions)
			.set({ expiresAt })
			.where(eq(sessions.id, id));
	}

	return { user: row.user, expiresAt };
}

export type SessionSummary = {
	id: string;
	createdAt: Date;
	sharedDevice: boolean;
	current: boolean;
};

/** The signed-in person's open sessions. The token hash is an id, not a secret they can replay. */
export async function listSessions(
	database: Pick<Database, "select">,
	input: { userId: number; token: string },
): Promise<SessionSummary[]> {
	const currentId = await hashToken(input.token);
	const rows = await database
		.select({
			id: sessions.id,
			createdAt: sessions.createdAt,
			sharedDevice: sessions.sharedDevice,
			expiresAt: sessions.expiresAt,
		})
		.from(sessions)
		.where(eq(sessions.userId, input.userId));
	const now = Date.now();
	return rows
		.filter((row) => row.expiresAt.getTime() > now)
		.map((row) => ({
			id: row.id,
			createdAt: row.createdAt,
			sharedDevice: row.sharedDevice,
			current: row.id === currentId,
		}));
}

/** Ends one of this person's sessions. Another person's id is not found. */
export async function revokeSession(
	database: SessionDb,
	input: { userId: number; sessionId: string; token: string; ip: string },
): Promise<{ revoked: true; current: boolean }> {
	const [row] = await database
		.select({ id: sessions.id })
		.from(sessions)
		.where(
			and(eq(sessions.id, input.sessionId), eq(sessions.userId, input.userId)),
		)
		.limit(1);
	if (!row) throw errors.notFound("Session not found");
	const current = (await hashToken(input.token)) === row.id;
	await database.delete(sessions).where(eq(sessions.id, row.id));
	await writeAudit(database, {
		actorId: input.userId,
		action: "auth.session_revoked",
		targetType: "session",
		targetId: row.id,
		ipAddress: input.ip,
	});
	return { revoked: true, current };
}

/** Ends every session for this account, including the one making the request. */
export async function revokeAllSessions(
	database: SessionDb,
	input: { userId: number; ip: string },
): Promise<{ revoked: true }> {
	await database.delete(sessions).where(eq(sessions.userId, input.userId));
	await writeAudit(database, {
		actorId: input.userId,
		action: "auth.sessions_revoked",
		targetType: "user",
		targetId: String(input.userId),
		ipAddress: input.ip,
	});
	return { revoked: true };
}

export async function invalidateSession(token: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, await hashToken(token)));
}

/** Sign the user out everywhere. */
export async function invalidateUserSessions(userId: number): Promise<void> {
	await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function cleanExpiredSessions(): Promise<void> {
	await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export function getSessionTokenFromRequest(
	request: Request,
): string | undefined {
	return parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
}

export function sessionCookie(token: string): string {
	return serializeCookie(SESSION_COOKIE, token, {
		maxAge: env.sessionTtlMs / 1000,
		httpOnly: true,
		secure: env.cookieSecure,
		sameSite: env.cookieSameSite,
		domain: env.cookieDomain,
		path: "/",
	});
}

export function clearSessionCookie(): string {
	return serializeCookie(SESSION_COOKIE, "", {
		maxAge: 0,
		expires: new Date(0),
		httpOnly: true,
		secure: env.cookieSecure,
		sameSite: env.cookieSameSite,
		domain: env.cookieDomain,
		path: "/",
	});
}
