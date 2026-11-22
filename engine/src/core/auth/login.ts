import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { env } from "../../config/env";
import type { Database } from "../../db";
import { otpChallenges, users } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { consumeRateLimit } from "../guard/rate-limit";
import type { SmsSender } from "../sms/sender";
import { hashPassword, verifyPassword } from "./password";
import { normalizeRwandanPhone } from "./phone";
import { createSession } from "./sessions";

const CODE_TTL_MS = 5 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const SEND_LIMIT = 3;
const IP_SEND_LIMIT = 10;

type LoginDb = Pick<Database, "insert" | "select" | "update">;
type FailureReason = "wrong_code" | "wrong_password";
type Failure = { count: number; resetAt: number };

const failures = new Map<string, Failure>();
const lockedUntil = new Map<string, number>();
let now = () => Date.now();
let dummyHash: Promise<string> | null = null;

export type OtpLogin = { method: "otp"; phone: string; code: string };
export type PasswordLogin = {
	method: "password";
	email: string;
	password: string;
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

function assertUnlocked(key: string): void {
	const until = lockedUntil.get(key) ?? 0;
	if (until > now()) {
		throw errors.tooManyRequests("Too many attempts. Wait and try again.");
	}
	if (until) lockedUntil.delete(key);
}

function failureMessage(reason: FailureReason): string {
	switch (reason) {
		case "wrong_code":
			return "That code is not right.";
		case "wrong_password":
			return "The email or password is wrong.";
		default: {
			const unreachable: never = reason;
			return unreachable;
		}
	}
}

function noteFailure(key: string, reason: FailureReason): never {
	const current = failures.get(key);
	const count = current && current.resetAt > now() ? current.count + 1 : 1;
	if (count >= MAX_FAILURES) {
		failures.delete(key);
		lockedUntil.set(key, now() + LOCK_MS);
		throw errors.tooManyRequests("Too many attempts. Wait and try again.");
	}
	failures.set(key, { count, resetAt: now() + LOCK_MS });
	throw errors.badRequest(failureMessage(reason), { reason });
}

function clearFailures(key: string): void {
	failures.delete(key);
	lockedUntil.delete(key);
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
): Promise<{ token: string; user: SignedInUser }> {
	const token = await createSession(user.id, database);
	await writeAudit(database, {
		actorId: user.id,
		action: "auth.session_created",
		targetType: "user",
		targetId: String(user.id),
		ipAddress: ip,
		metadata: { method },
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
	assertUnlocked(guardKey("otp", phone));

	const [user] = await database
		.select({ id: users.id })
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
	await sender.send({ to: phone, body: `Ikiraro code: ${code}` });
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
	assertUnlocked(key);

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
		noteFailure(key, "wrong_code");
	}

	const [user] = await database
		.select({
			id: users.id,
			email: users.email,
			name: users.name,
			activatedAt: users.activatedAt,
		})
		.from(users)
		.where(and(eq(users.phone, phone), isNull(users.deletedAt)))
		.limit(1);
	if (!user) noteFailure(key, "wrong_code");
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
	input: OtpLogin & { ip: string },
): Promise<{ token: string; user: SignedInUser }> {
	const matched = await readMatchingOtp(database, input);
	if (!matched.user.activatedAt) {
		throw errors.badRequest(
			"This account is not active yet. Enter the code to finish registration.",
			{ reason: "not_active" },
		);
	}
	await consumeOtpChallenge(database, matched.challengeId);
	clearFailures(guardKey("otp", matched.phone));
	return issue(database, matched.user, input.ip, "otp");
}

async function loginWithPassword(
	database: LoginDb,
	input: PasswordLogin & { ip: string },
): Promise<{ token: string; user: SignedInUser }> {
	const email = input.email.trim().toLowerCase();
	const key = guardKey("password", email);
	assertUnlocked(key);

	const [user] = await database
		.select({
			id: users.id,
			email: users.email,
			name: users.name,
			passwordHash: users.passwordHash,
			activatedAt: users.activatedAt,
		})
		.from(users)
		.where(and(eq(users.email, email), isNull(users.deletedAt)))
		.limit(1);
	const passwordHash = user?.passwordHash ?? (await dummyPasswordHash());
	const valid = await verifyPassword(input.password, passwordHash);
	if (!user?.passwordHash || !valid) noteFailure(key, "wrong_password");

	if (!user.activatedAt) {
		throw errors.badRequest(
			"This account is not active yet. Enter the code to finish registration.",
			{ reason: "not_active" },
		);
	}
	clearFailures(key);
	return issue(
		database,
		{ id: user.id, email: user.email, name: user.name },
		input.ip,
		"password",
	);
}

/** Opens a session from a one-time code or from email and password. */
export async function login(
	database: LoginDb,
	input: (OtpLogin | PasswordLogin) & { ip: string },
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
