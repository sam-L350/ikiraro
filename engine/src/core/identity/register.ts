import { eq } from "drizzle-orm";
import type { Database } from "../../db";
import {
	consents,
	digitalPassports,
	roles,
	userRoles,
	users,
} from "../../db/schema";
import { errors, isApiError } from "../api/error";
import { writeAudit } from "../audit/write";
import { consumeOtpChallenge, createOtp, readMatchingOtp } from "../auth/login";
import { normalizeRwandanPhone } from "../auth/phone";
import { createSession } from "../auth/sessions";
import { type PlacementSuggestion, storePlacement } from "../learning/pathways";
import type { SmsSender } from "../sms/sender";
import { isUnder18, parseDateOfBirth } from "./age";
import {
	CONSENT_VERSION,
	type ConsentChoice,
	registrationConsents,
} from "./consent";

type RegisterDb = Pick<
	Database,
	"insert" | "select" | "update" | "transaction"
>;

export type RegistrationInput = {
	name: string;
	phone: string;
	dateOfBirth: string;
	district: string;
	sector: string;
	village: string;
	economicSector: string;
	locale: "rw" | "en";
	email?: string;
	gender?: string;
	guardianContact?: string;
	consents: ConsentChoice[];
	placementChoiceIds?: string[];
	ip: string;
};

export type RegisteredLearner = {
	id: number;
	name: string;
	phone: string;
	active: false;
	codeSent: boolean;
	suggestion: PlacementSuggestion | null;
};

const PHONE_EMAIL_DOMAIN = "@phone.ikiraro.local";

function requiredText(value: string, reason: string, message: string): string {
	const trimmed = value.trim();
	if (!trimmed) throw errors.badRequest(message, { reason });
	return trimmed;
}

function optionalText(value: string | undefined): string | null {
	const trimmed = value?.trim() ?? "";
	return trimmed ? trimmed : null;
}

export function phoneEmail(phone: string): string {
	return `${phone}${PHONE_EMAIL_DOMAIN}`;
}

export function visibleEmail(email: string): string | null {
	if (email.endsWith(PHONE_EMAIL_DOMAIN)) return null;
	if (email.endsWith("@removed.ikiraro.local")) return null;
	return email;
}

function isUniqueViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if ("code" in error && error.code === "23505") return true;
	if ("cause" in error) return isUniqueViolation(error.cause);
	return false;
}

function localeOf(value: string): "rw" | "en" {
	switch (value) {
		case "rw":
		case "en":
			return value;
		default:
			throw errors.badRequest("Choose Kinyarwanda or English.", {
				reason: "invalid_locale",
			});
	}
}

export async function registerLearner(
	database: RegisterDb,
	input: RegistrationInput & { createdByUserId?: number },
	sender: SmsSender,
): Promise<RegisteredLearner> {
	const name = requiredText(
		input.name,
		"invalid_name",
		"Enter the learner's name.",
	);
	const district = requiredText(
		input.district,
		"invalid_place",
		"Enter a district.",
	);
	const sector = requiredText(input.sector, "invalid_place", "Enter a sector.");
	const village = requiredText(
		input.village,
		"invalid_place",
		"Enter a village.",
	);
	const economicSector = requiredText(
		input.economicSector,
		"invalid_place",
		"Enter the kind of work.",
	);
	const dateOfBirth = parseDateOfBirth(input.dateOfBirth);
	const minor = isUnder18(dateOfBirth);
	const guardianContact = optionalText(input.guardianContact);
	const rows = registrationConsents(input.consents, minor, guardianContact);
	const email = optionalText(input.email)?.toLowerCase();
	const phone = normalizeRwandanPhone(input.phone);
	if (!phone) {
		throw errors.badRequest("Enter a Rwandan phone number.", {
			reason: "invalid_phone",
		});
	}

	let created: {
		id: number;
		phone: string;
		suggestion: PlacementSuggestion | null;
	};
	try {
		created = await database.transaction(async (tx) => {
			const [user] = await tx
				.insert(users)
				.values({
					email: email ?? phoneEmail(phone),
					phone,
					name,
					dateOfBirth,
					gender: optionalText(input.gender),
					district,
					sector,
					village,
					economicSector,
					locale: localeOf(input.locale),
					guardianContact,
					createdByUserId: input.createdByUserId,
					activatedAt: null,
				})
				.returning({ id: users.id, phone: users.phone });
			if (!user?.phone) throw new Error("Failed to create learner");

			await tx.insert(digitalPassports).values({ userId: user.id });
			await tx.insert(consents).values(
				rows.map((row) => ({
					userId: user.id,
					purpose: row.purpose,
					granted: row.granted,
					version: CONSENT_VERSION,
				})),
			);
			await writeAudit(tx, {
				actorId: input.createdByUserId ?? user.id,
				action: "registration.created",
				targetType: "user",
				targetId: String(user.id),
				ipAddress: input.ip,
				metadata: {
					assisted: input.createdByUserId !== undefined,
					minor,
				},
			});
			const choiceIds = input.placementChoiceIds ?? [];
			const suggestion =
				choiceIds.length > 0
					? await storePlacement(tx, {
							userId: user.id,
							choiceIds,
							ip: input.ip,
						})
					: null;
			return { id: user.id, phone: user.phone, suggestion };
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw errors.conflict("This phone or email is already registered.", {
				reason: "phone_taken",
			});
		}
		throw error;
	}

	let codeSent = true;
	try {
		await createOtp(database, { phone: created.phone, ip: input.ip }, sender);
	} catch (error) {
		if (isApiError(error) && error.status === 429) codeSent = false;
		else throw error;
	}

	return {
		id: created.id,
		name,
		phone: created.phone,
		active: false,
		codeSent,
		suggestion: created.suggestion,
	};
}

/**
 * Turns an inactive registration into a learner session. A wrong code leaves
 * the account inactive. An account that is already active is not touched.
 */
export async function activateLearner(
	database: RegisterDb,
	input: { phone: string; code: string; ip: string; sharedDevice?: boolean },
): Promise<{
	token: string;
	user: { id: number; email: string; name: string | null };
}> {
	const matched = await readMatchingOtp(database, input);
	if (matched.user.activatedAt) {
		throw errors.badRequest("This account is already active. Sign in.", {
			reason: "already_active",
		});
	}

	const token = await database.transaction(async (tx) => {
		await consumeOtpChallenge(tx, matched.challengeId);
		await tx
			.update(users)
			.set({ activatedAt: new Date() })
			.where(eq(users.id, matched.user.id));

		const [role] = await tx
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.code, "learner"))
			.limit(1);
		if (!role) throw errors.internal("The learner role is not available yet.");
		await tx
			.insert(userRoles)
			.values({
				userId: matched.user.id,
				roleId: role.id,
				scopeType: "self",
				scopeId: String(matched.user.id),
			})
			.onConflictDoNothing();

		const session = await createSession(matched.user.id, tx, {
			sharedDevice: input.sharedDevice === true,
		});
		await writeAudit(tx, {
			actorId: matched.user.id,
			action: "registration.activated",
			targetType: "user",
			targetId: String(matched.user.id),
			ipAddress: input.ip,
			metadata: { method: "otp" },
		});
		return session;
	});

	return {
		token,
		user: {
			id: matched.user.id,
			email: matched.user.email,
			name: matched.user.name,
		},
	};
}
