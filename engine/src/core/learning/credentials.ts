import {
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { env } from "../../config/env";
import type { Database } from "../../db";
import {
	badgeCredentials,
	digitalPassports,
	earnedBadges,
	submissionVerifications,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { consumeRateLimit } from "../guard/rate-limit";
import { isUnder18 } from "../identity/age";
import { currentConsents } from "../identity/consent";

const ISSUER = "Ikiraro";
const CHECK_LIMIT = 30;
const CHECK_WINDOW_MS = 60_000;

export type CredentialSubject = "badge" | "passport" | "unknown";

export type CredentialCheck = {
	subject: CredentialSubject;
	authentic: boolean;
	revoked: boolean;
};

type CredentialDb = Pick<Database, "select" | "insert" | "transaction">;

type AwardedRow = {
	earnedBadgeId: string;
	badgeId: string;
	userId: number;
	verifierUserId: number;
	awardedAt: Date;
};

const UNKNOWN: CredentialCheck = {
	subject: "unknown",
	authentic: false,
	revoked: false,
};

function signingKey(): string {
	const key = env.credentialSigningKey;
	if (key.length < 16) {
		throw errors.unavailable("The signing key is not configured.");
	}
	return key;
}

function canonical(input: {
	earnedBadgeId: string;
	badgeId: string;
	userId: number;
	issuer: string;
	verifierUserId: number;
	awardedAt: string;
}): string {
	return [
		"v1",
		input.earnedBadgeId,
		input.badgeId,
		String(input.userId),
		input.issuer,
		String(input.verifierUserId),
		input.awardedAt,
	].join("\n");
}

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function signHash(hash: string): string {
	return createHmac("sha256", signingKey()).update(hash).digest("hex");
}

function sameHex(left: string, right: string): boolean {
	if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) {
		return false;
	}
	return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function isUnique(error: unknown): boolean {
	if (typeof error === "object" && error !== null && "code" in error) {
		if (error.code === "23505") return true;
	}
	if (error instanceof Error && error.cause) return isUnique(error.cause);
	return false;
}

async function awardedRow(
	database: Pick<Database, "select">,
	verificationId: string,
): Promise<AwardedRow | null> {
	const [row] = await database
		.select({
			earnedBadgeId: earnedBadges.id,
			badgeId: earnedBadges.badgeId,
			userId: earnedBadges.userId,
			verifierUserId: submissionVerifications.reviewerUserId,
			awardedAt: earnedBadges.createdAt,
		})
		.from(earnedBadges)
		.innerJoin(
			submissionVerifications,
			eq(submissionVerifications.id, earnedBadges.verificationId),
		)
		.where(
			and(
				eq(earnedBadges.verificationId, verificationId),
				eq(earnedBadges.entry, "awarded"),
			),
		)
		.limit(1);
	return row ?? null;
}

async function insertCredential(
	database: CredentialDb,
	row: AwardedRow,
	ip: string,
): Promise<void> {
	const [existing] = await database
		.select({ id: badgeCredentials.id })
		.from(badgeCredentials)
		.where(eq(badgeCredentials.earnedBadgeId, row.earnedBadgeId))
		.limit(1);
	if (existing) return;
	const awardedAt = row.awardedAt.toISOString();
	const contentHash = digest(
		canonical({
			earnedBadgeId: row.earnedBadgeId,
			badgeId: row.badgeId,
			userId: row.userId,
			issuer: ISSUER,
			verifierUserId: row.verifierUserId,
			awardedAt,
		}),
	);
	const signature = signHash(contentHash);
	const token = randomBytes(32).toString("base64url");
	try {
		await database.transaction(async (tx) => {
			const [created] = await tx
				.insert(badgeCredentials)
				.values({
					earnedBadgeId: row.earnedBadgeId,
					issuer: ISSUER,
					verifierUserId: row.verifierUserId,
					awardedAt: row.awardedAt,
					contentHash,
					signature,
					token,
				})
				.returning({ id: badgeCredentials.id });
			if (!created) throw errors.internal("The credential was not stored.");
			await writeAudit(tx, {
				actorId: row.verifierUserId,
				action: "credential.signed",
				targetType: "badge_credential",
				targetId: created.id,
				ipAddress: ip,
				metadata: { earnedBadgeId: row.earnedBadgeId },
			});
		});
	} catch (error) {
		if (isUnique(error)) return;
		throw error;
	}
}

/** Store the issuer, verifier, date, and signed hash for one awarded badge. */
export async function signAwardedBadge(
	database: CredentialDb,
	input: { verificationId: string; ip: string },
): Promise<void> {
	const row = await awardedRow(database, input.verificationId);
	if (!row) return;
	await insertCredential(database, row, input.ip);
}

async function signMissing(
	database: CredentialDb,
	userId: number,
	ip: string,
): Promise<void> {
	const rows = await database
		.select({ verificationId: earnedBadges.verificationId })
		.from(earnedBadges)
		.leftJoin(
			badgeCredentials,
			eq(badgeCredentials.earnedBadgeId, earnedBadges.id),
		)
		.where(
			and(
				eq(earnedBadges.userId, userId),
				eq(earnedBadges.entry, "awarded"),
				isNull(badgeCredentials.id),
			),
		);
	for (const row of rows) {
		await signAwardedBadge(database, {
			verificationId: row.verificationId,
			ip,
		});
	}
}

function authenticRecord(input: {
	earnedBadgeId: string;
	badgeId: string;
	userId: number;
	issuer: string;
	verifierUserId: number;
	awardedAt: Date;
	contentHash: string;
	signature: string;
}): boolean {
	const contentHash = digest(
		canonical({
			earnedBadgeId: input.earnedBadgeId,
			badgeId: input.badgeId,
			userId: input.userId,
			issuer: input.issuer,
			verifierUserId: input.verifierUserId,
			awardedAt: input.awardedAt.toISOString(),
		}),
	);
	if (!sameHex(contentHash, input.contentHash)) return false;
	return sameHex(signHash(input.contentHash), input.signature);
}

async function badgeResult(
	database: Pick<Database, "select">,
	token: string,
): Promise<CredentialCheck | null> {
	const [row] = await database
		.select({
			earnedBadgeId: badgeCredentials.earnedBadgeId,
			issuer: badgeCredentials.issuer,
			verifierUserId: badgeCredentials.verifierUserId,
			awardedAt: badgeCredentials.awardedAt,
			contentHash: badgeCredentials.contentHash,
			signature: badgeCredentials.signature,
			userId: earnedBadges.userId,
			badgeId: earnedBadges.badgeId,
		})
		.from(badgeCredentials)
		.innerJoin(
			earnedBadges,
			eq(earnedBadges.id, badgeCredentials.earnedBadgeId),
		)
		.where(eq(badgeCredentials.token, token))
		.limit(1);
	if (!row) return null;
	const [revoked] = await database
		.select({ id: earnedBadges.id })
		.from(earnedBadges)
		.where(
			and(
				eq(earnedBadges.userId, row.userId),
				eq(earnedBadges.badgeId, row.badgeId),
				eq(earnedBadges.entry, "revoked"),
			),
		)
		.limit(1);
	return {
		subject: "badge",
		authentic: authenticRecord(row),
		revoked: Boolean(revoked),
	};
}

async function livePassportUser(
	database: Pick<Database, "select">,
	token: string,
): Promise<number | null> {
	const [passport] = await database
		.select({ userId: digitalPassports.userId })
		.from(digitalPassports)
		.where(eq(digitalPassports.publicShareToken, token))
		.limit(1);
	if (!passport) return null;
	const [person] = await database
		.select({
			dateOfBirth: users.dateOfBirth,
			deletedAt: users.deletedAt,
			deactivatedAt: users.deactivatedAt,
		})
		.from(users)
		.where(eq(users.id, passport.userId))
		.limit(1);
	if (!person || person.deletedAt || person.deactivatedAt) return null;
	if (!person.dateOfBirth || isUnder18(person.dateOfBirth)) return null;
	const consents = await currentConsents(database, passport.userId);
	const allowed = consents.some(
		(row) => row.purpose === "public_passport" && row.granted,
	);
	if (!allowed) return null;
	return passport.userId;
}

async function passportResult(
	database: CredentialDb,
	token: string,
	inputIp: string,
): Promise<CredentialCheck | null> {
	const userId = await livePassportUser(database, token);
	if (userId === null) return null;
	await signMissing(database, userId, inputIp);
	const rows = await database
		.select({
			badgeId: earnedBadges.badgeId,
			entry: earnedBadges.entry,
			earnedBadgeId: earnedBadges.id,
			userId: earnedBadges.userId,
			issuer: badgeCredentials.issuer,
			verifierUserId: badgeCredentials.verifierUserId,
			awardedAt: badgeCredentials.awardedAt,
			contentHash: badgeCredentials.contentHash,
			signature: badgeCredentials.signature,
		})
		.from(earnedBadges)
		.leftJoin(
			badgeCredentials,
			eq(badgeCredentials.earnedBadgeId, earnedBadges.id),
		)
		.where(eq(earnedBadges.userId, userId));
	const revoked = new Set(
		rows.filter((row) => row.entry === "revoked").map((row) => row.badgeId),
	);
	let authentic = true;
	for (const row of rows) {
		if (row.entry !== "awarded" || revoked.has(row.badgeId)) continue;
		if (
			!row.issuer ||
			row.verifierUserId === null ||
			!row.awardedAt ||
			!row.contentHash ||
			!row.signature ||
			!authenticRecord({
				earnedBadgeId: row.earnedBadgeId,
				badgeId: row.badgeId,
				userId: row.userId,
				issuer: row.issuer,
				verifierUserId: row.verifierUserId,
				awardedAt: row.awardedAt,
				contentHash: row.contentHash,
				signature: row.signature,
			})
		) {
			authentic = false;
		}
	}
	return { subject: "passport", authentic, revoked: revoked.size > 0 };
}

/**
 * Public lookup. A passport share token or a badge token comes in.
 * Authenticity and revocation go out. The call is rate-limited by IP.
 */
export async function checkCredential(
	database: CredentialDb,
	input: { token: string; ip: string },
): Promise<CredentialCheck> {
	const limit = consumeRateLimit({
		key: `credential-check\n${input.ip}`,
		limit: CHECK_LIMIT,
		windowMs: CHECK_WINDOW_MS,
	});
	if (!limit.ok) {
		throw errors.tooManyRequests("Too many checks. Wait and try again.");
	}
	const token = input.token.trim();
	if (!token) {
		throw errors.badRequest("Paste a token.", { reason: "token" });
	}
	const badge = await badgeResult(database, token);
	if (badge) return badge;
	const passport = await passportResult(database, token, input.ip);
	if (passport) return passport;
	return UNKNOWN;
}
