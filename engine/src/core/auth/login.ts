import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { env } from "../../config/env";
import type { Database } from "../../db";
import { loginLocks, otpChallenges, users } from "../../db/schema";
import { errors, isApiError } from "../api/error";
import { writeAudit } from "../audit/write";
import { consumeRateLimit } from "../guard/rate-limit";
import { rememberSmsSpend } from "../sms/charges";
import type { SmsSender } from "../sms/sender";
import { confirmedSecret } from "./factors";
import { hashPassword, verifyPassword } from "./password";
import { normalizeRwandanPhone } from "./phone";
import { createSession } from "./sessions";
import { verifyTotp } from "./totp";

const CODE_TTL_MS = 5 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const SEND_LIMIT = 3;
const IP_SEND_LIMIT = 10;

type LoginDb = Pick<Database, "insert" | "select" | "update">;
type FailureReason = "wrong_code" | "wrong_password" | "wrong_second";
type Failure = { count: number; resetAt: number };

const failures = new Map<string, Failure>();
const lockedUntil = new Map<string, number>();
let now = () => Date.now();
let dummyHash: Promise<string> | null = null;

export type OtpLogin = {
	method: "otp";
	phone: string;
	code: string;
	secondCode?: string;
};
export type PasswordLogin = {
	method: "password";
	email: string;
	password: string;
	secondCode?: string;
};
export type SignedInUser = {
	id: number;
	email: string;
	name: string | null;
};

export function setLoginClock(next: () => number): void {
	now = next;
}

export function resetLoginGuards(): void {
	failures.clear();
	lockedUntil.clear();
	now = () => Date.now();
}

function guardKey(kind: "otp" | "password", subject: string): string {
	return `${kind}\n${subject}`;
}

async function readStoredLock(
	database: Pick<Database, "select">,
	key: string,
): Promise<{ failures: number; resetAt: number; lockedUntil: number } | null> {
	const [row] = await database
		.select({
			failures: loginLocks.failures,
			resetAt: loginLocks.resetAt,
			lockedUntil: loginLocks.lockedUntil,
		})
		.from(loginLocks)
		.where(eq(loginLocks.subject, key))
		.limit(1);
	if (!row) return null;
	return {
		failures: row.failures,
		resetAt: row.resetAt.getTime(),
		lockedUntil: row.lockedUntil?.getTime() ?? 0,
	};
}

async function writeStoredLock(
	database: Pick<Database, "insert">,
	key: string,
	input: { failures: number; resetAt: number; lockedUntil: number },
): Promise<void> {
	await database
		.insert(loginLocks)
		.values({
			subject: key,
			failures: input.failures,
			resetAt: new Date(input.resetAt),
			lockedUntil: input.lockedUntil > 0 ? new Date(input.lockedUntil) : null,
		})
		.onConflictDoUpdate({
			target: loginLocks.subject,
			set: {
				failures: input.failures,
				resetAt: new Date(input.resetAt),
				lockedUntil: input.lockedUntil > 0 ? new Date(input.lockedUntil) : null,
			},
		});
}

async function clearStoredLock(
	database: Pick<Database, "update">,
	key: string,
): Promise<void> {
	await database
		.update(loginLocks)
		.set({
			failures: 0,
			resetAt: new Date(now()),
			lockedUntil: null,
		})
		.where(eq(loginLocks.subject, key));
}

async function assertUnlocked(database: LoginDb, key: string): Promise<void> {
	const until = lockedUntil.get(key) ?? 0;
	if (until > now()) {
		throw errors.tooManyRequests("Too many attempts. Wait and try again.");
	}
	if (until) lockedUntil.delete(key);
	const stored = await readStoredLock(database, key);
	if (stored && stored.lockedUntil > now()) {
		lockedUntil.set(key, stored.lockedUntil);
		throw errors.tooManyRequests("Too many attempts. Wait and try again.");
	}
	if (stored && stored.lockedUntil > 0) await clearStoredLock(database, key);
}

function failureMessage(reason: FailureReason): string {
	switch (reason) {
		case "wrong_code":
			return "That code is not right.";
		case "wrong_password":
			return "The email or password is wrong.";
		case "wrong_second":
			return "That code is not right.";
		default: {
			const unreachable: never = reason;
			return unreachable;
		}
	}
}

async function noteFailure(
	database: LoginDb,
	key: string,
	reason: FailureReason,
): Promise<never> {
	const current = failures.get(key);
	const stored = await readStoredLock(database, key);
	const memoryCount = current && current.resetAt > now() ? current.count : 0;
	const storedCount = stored && stored.resetAt > now() ? stored.failures : 0;
	const count = Math.max(memoryCount, storedCount) + 1;
	if (count >= MAX_FAILURES) {
		failures.delete(key);
		const until = now() + LOCK_MS;
		lockedUntil.set(key, until);
		await writeStoredLock(database, key, {
			failures: 0,
			resetAt: until,
			lockedUntil: until,
		});
		throw errors.tooManyRequests("Too many attempts. Wait and try again.");
	}
	const resetAt = now() + LOCK_MS;
	failures.set(key, { count, resetAt });
	await writeStoredLock(database, key, {
		failures: count,
		resetAt,
		lockedUntil: 0,
	});
	throw errors.badRequest(failureMessage(reason), { reason });
}

async function clearFailures(database: LoginDb, key: string): Promise<void> {
	failures.delete(key);
	lockedUntil.delete(key);
	await clearStoredLock(database, key);
}

async function requireSecondCode(
	database: LoginDb,
	userId: number,
	key: string,
	secondCode: string | undefined,
): Promise<void> {
	const secret = await confirmedSecret(database, userId);
	if (!secret) return;
	const code = secondCode?.trim() ?? "";
	if (!code) {
		throw errors.badRequest("Enter the second code.", {
			reason: "second_code",
		});
	}
	if (!(await verifyTotp(secret, code, now()))) {
		await noteFailure(database, key, "wrong_second");
	}
}

/** Whether this person's sign-in is locked. The guard key stays on the server. */
export async function readOwnLock(
	database: Pick<Database, "select">,
	input: { email: string; phone: string | null },
): Promise<{ locked: boolean; until: string | null }> {
	const keys = [guardKey("password", input.email.trim().toLowerCase())];
	if (input.phone) keys.push(guardKey("otp", input.phone));
	let until = 0;
	for (const key of keys) {
		const memory = lockedUntil.get(key) ?? 0;
		const stored = await readStoredLock(database, key);
		const candidate = Math.max(memory, stored?.lockedUntil ?? 0);
		if (candidate > until) until = candidate;
	}
	if (until <= now()) return { locked: false, until: null };
	return { locked: true, until: new Date(until).toISOString() };
}

async function hashCode(phone: string, code: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(env.otpPepper),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`${phone}:${code}`),
	);
	return Array.from(new Uint8Array(signature))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function hashesMatch(left: string, right: string): boolean {
	const a = Buffer.from(left);
	const b = Buffer.from(right);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

function randomCode(): string {
	const bytes = new Uint32Array(1);
	crypto.getRandomValues(bytes);
	const value = bytes[0] ?? 0;
	return String(value % 1_000_000).padStart(6, "0");
}

function dummyPasswordHash(): Promise<string> {
	dummyHash ??= hashPassword("ikiraro-dummy-password");
	return dummyHash;
}

async function issue(
	database: LoginDb,
	user: SignedInUser,
	ip: string,
	method: "otp" | "password",
	sharedDevice: boolean,
): Promise<{ token: string; user: SignedInUser }> {
	const token = await createSession(user.id, database, { sharedDevice });
	await writeAudit(database, {
		actorId: user.id,
		action: "auth.session_created",
		targetType: "user",
		targetId: String(user.id),
		ipAddress: ip,
		metadata: { method, sharedDevice },
	});
	return {
		token,
		user: { id: user.id, email: user.email, name: user.name },
	};
}

/** Sends a one-time code when the phone belongs to a user. The code is not returned. */
export async function createOtp(
	database: LoginDb,
	input: { phone: string; ip: string },
	sender: SmsSender,
): Promise<{ sent: true }> {
	const phone = normalizeRwandanPhone(input.phone);
	if (!phone) {
		throw errors.badRequest("Enter a Rwandan phone number.", {
			reason: "invalid_phone",
		});
	}

	const phoneLimit = consumeRateLimit({
		key: `otp-send\n${phone}`,
		limit: SEND_LIMIT,
		windowMs: LOCK_MS,
	});
	const ipLimit = consumeRateLimit({
		key: `otp-send-ip\n${input.ip}`,
		limit: IP_SEND_LIMIT,
		windowMs: LOCK_MS,
	});
	if (!phoneLimit.ok || !ipLimit.ok) {
		throw errors.tooManyRequests("Too many attempts. Wait and try again.");
	}
	await assertUnlocked(database, guardKey("otp", phone));

	const [user] = await database
		.select({ id: users.id, centerId: users.centerId })
		.from(users)
		.where(and(eq(users.phone, phone), isNull(users.deletedAt)))
		.limit(1);
	if (!user) return { sent: true };

	const code = randomCode();
	const stamped = new Date(now());
	await database
		.update(otpChallenges)
		.set({ consumedAt: stamped })
		.where(
			and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt)),
		);
	await database.insert(otpChallenges).values({
		phone,
		codeHash: await hashCode(phone, code),
		expiresAt: new Date(now() + CODE_TTL_MS),
	});
	try {
		const result = await sender.send({
			to: phone,
			body: `Ikiraro code: ${code}`,
		});
		if (result?.providerMessageId) {
			await rememberSmsSpend(database, {
				userId: user.id,
				centerId: user.centerId,
				notificationId: null,
				provider: result.provider,
				providerMessageId: result.providerMessageId,
				currency: result.currency,
				amount: result.amount,
			});
		}
	} catch (error) {
		if (isApiError(error)) throw error;
		throw errors.unavailable("The text could not be sent. Try again.");
	}
	return { sent: true };
}

export type MatchedOtp = {
	challengeId: string;
	phone: string;
	user: {
		id: number;
		email: string;
		name: string | null;
		activatedAt: Date | null;
		deactivatedAt: Date | null;
	};
};

/**
 * Checks a one-time code and leaves it unconsumed. Activation and sign-in
 * decide what happens next, so a sign-in attempt cannot burn the code a
 * learner still needs in order to activate.
 */
export async function readMatchingOtp(
	database: LoginDb,
	input: { phone: string; code: string },
): Promise<MatchedOtp> {
	const phone = normalizeRwandanPhone(input.phone);
	if (!phone) {
		throw errors.badRequest("Enter a Rwandan phone number.", {
			reason: "invalid_phone",
		});
	}
	const key = guardKey("otp", phone);
	await assertUnlocked(database, key);

	const [challenge] = await database
		.select({
			id: otpChallenges.id,
			codeHash: otpChallenges.codeHash,
			expiresAt: otpChallenges.expiresAt,
			attempts: otpChallenges.attempts,
		})
		.from(otpChallenges)
		.where(
			and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt)),
		)
		.orderBy(desc(otpChallenges.createdAt))
		.limit(1);
	const expired = !challenge || challenge.expiresAt.getTime() <= now();
	const matches =
		challenge !== undefined &&
		!expired &&
		hashesMatch(challenge.codeHash, await hashCode(phone, input.code.trim()));
	if (!challenge || !matches) {
		if (challenge) {
			await database
				.update(otpChallenges)
				.set({ attempts: challenge.attempts + 1 })
				.where(eq(otpChallenges.id, challenge.id));
		}
		await noteFailure(database, key, "wrong_code");
	}
	if (!challenge) {
		throw errors.badRequest("That code is not right.", {
			reason: "wrong_code",
		});
	}

	const [user] = await database
		.select({
			id: users.id,
			email: users.email,
			name: users.name,
			activatedAt: users.activatedAt,
			deactivatedAt: users.deactivatedAt,
		})
		.from(users)
		.where(and(eq(users.phone, phone), isNull(users.deletedAt)))
		.limit(1);
	if (!user) await noteFailure(database, key, "wrong_code");
	if (!user) {
		throw errors.badRequest("That code is not right.", {
			reason: "wrong_code",
		});
	}
	return { challengeId: challenge.id, phone, user };
}

export async function consumeOtpChallenge(
	database: LoginDb,
	challengeId: string,
): Promise<void> {
	await database
		.update(otpChallenges)
		.set({ consumedAt: new Date(now()) })
		.where(eq(otpChallenges.id, challengeId));
}

async function loginWithOtp(
	database: LoginDb,
	input: OtpLogin & { ip: string; sharedDevice?: boolean },
): Promise<{ token: string; user: SignedInUser }> {
	const matched = await readMatchingOtp(database, input);
	if (!matched.user.activatedAt) {
		throw errors.badRequest(
			"This account is not active yet. Enter the code to finish registration.",
			{ reason: "not_active" },
		);
	}
	if (matched.user.deactivatedAt) {
		throw errors.badRequest(
			"This account is deactivated. Get back in with a code.",
			{ reason: "deactivated" },
		);
	}
	await requireSecondCode(
		database,
		matched.user.id,
		guardKey("otp", matched.phone),
		input.secondCode,
	);
	await consumeOtpChallenge(database, matched.challengeId);
	await clearFailures(database, guardKey("otp", matched.phone));
	return issue(
		database,
		matched.user,
		input.ip,
		"otp",
		input.sharedDevice === true,
	);
}

async function loginWithPassword(
	database: LoginDb,
	input: PasswordLogin & { ip: string; sharedDevice?: boolean },
): Promise<{ token: string; user: SignedInUser }> {
	const email = input.email.trim().toLowerCase();
	const key = guardKey("password", email);
	await assertUnlocked(database, key);

	const [user] = await database
		.select({
			id: users.id,
			email: users.email,
			name: users.name,
			passwordHash: users.passwordHash,
			activatedAt: users.activatedAt,
			deactivatedAt: users.deactivatedAt,
		})
		.from(users)
		.where(and(eq(users.email, email), isNull(users.deletedAt)))
		.limit(1);
	const passwordHash = user?.passwordHash ?? (await dummyPasswordHash());
	const valid = await verifyPassword(input.password, passwordHash);
	if (!user?.passwordHash || !valid) {
		await noteFailure(database, key, "wrong_password");
	}
	if (!user?.passwordHash) {
		throw errors.badRequest("The email or password is wrong.", {
			reason: "wrong_password",
		});
	}

	if (!user.activatedAt) {
		throw errors.badRequest(
			"This account is not active yet. Enter the code to finish registration.",
			{ reason: "not_active" },
		);
	}
	if (user.deactivatedAt) {
		throw errors.badRequest(
			"This account is deactivated. Get back in with a code.",
			{ reason: "deactivated" },
		);
	}
	await requireSecondCode(database, user.id, key, input.secondCode);
	await clearFailures(database, key);
	return issue(
		database,
		{ id: user.id, email: user.email, name: user.name },
		input.ip,
		"password",
		input.sharedDevice === true,
	);
}

/** Opens a session from a one-time code or from email and password. */
export async function login(
	database: LoginDb,
	input: (OtpLogin | PasswordLogin) & { ip: string; sharedDevice?: boolean },
): Promise<{ token: string; user: SignedInUser }> {
	switch (input.method) {
		case "otp":
			return loginWithOtp(database, input);
		case "password":
			return loginWithPassword(database, input);
		default: {
			const unreachable: never = input;
			return unreachable;
		}
	}
}
