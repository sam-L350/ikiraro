import { desc, eq } from "drizzle-orm";
import type { Database } from "../../db";
import { consents, users } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { isUnder18 } from "./age";

/** The text version stored on every consent row until the wording changes. */
export const CONSENT_VERSION = "1";

export const CONSENT_PURPOSES = [
	"terms",
	"data_use",
	"public_passport",
	"leaderboard",
	"mentor_contact",
	"guardian",
] as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export type ConsentChoice = {
	purpose: ConsentPurpose;
	granted: boolean;
};

export type StoredConsent = {
	purpose: ConsentPurpose;
	granted: boolean;
	version: string;
	grantedAt: Date;
};

type ConsentDb = Pick<Database, "insert" | "select" | "transaction">;

const RESTRICTED_FOR_MINORS: readonly ConsentPurpose[] = [
	"public_passport",
	"mentor_contact",
];

export function isConsentPurpose(value: string): value is ConsentPurpose {
	return (CONSENT_PURPOSES as readonly string[]).includes(value);
}

function choiceMap(
	choices: readonly ConsentChoice[],
): Map<ConsentPurpose, boolean> {
	const map = new Map<ConsentPurpose, boolean>();
	for (const choice of choices) map.set(choice.purpose, choice.granted);
	return map;
}

/**
 * The rows written at registration. A minor cannot grant public passport or
 * mentor contact, and must grant guardian consent.
 */
export function registrationConsents(
	choices: readonly ConsentChoice[],
	minor: boolean,
	guardianContact: string | null,
): ConsentChoice[] {
	const map = choiceMap(choices);
	if (map.get("terms") !== true || map.get("data_use") !== true) {
		throw errors.badRequest("Agree to the terms and to data use.", {
			reason: "consent_required",
		});
	}
	if (minor && (map.get("guardian") !== true || !guardianContact)) {
		throw errors.badRequest(
			"A learner under 18 needs a guardian and their consent.",
			{ reason: "guardian_required" },
		);
	}

	const rows: ConsentChoice[] = [
		{ purpose: "terms", granted: true },
		{ purpose: "data_use", granted: true },
		{
			purpose: "public_passport",
			granted: minor ? false : map.get("public_passport") === true,
		},
		{
			purpose: "leaderboard",
			granted: map.get("leaderboard") === true,
		},
		{
			purpose: "mentor_contact",
			granted: minor ? false : map.get("mentor_contact") === true,
		},
	];
	if (minor) rows.push({ purpose: "guardian", granted: true });
	return rows;
}

export async function currentConsents(
	database: Pick<Database, "select">,
	userId: number,
): Promise<StoredConsent[]> {
	const rows = await database
		.select({
			purpose: consents.purpose,
			granted: consents.granted,
			version: consents.version,
			grantedAt: consents.grantedAt,
		})
		.from(consents)
		.where(eq(consents.userId, userId))
		.orderBy(desc(consents.grantedAt));

	const latest = new Map<string, StoredConsent>();
	for (const row of rows) {
		if (latest.has(row.purpose) || !isConsentPurpose(row.purpose)) continue;
		latest.set(row.purpose, {
			purpose: row.purpose,
			granted: row.granted,
			version: row.version,
			grantedAt: row.grantedAt,
		});
	}
	return CONSENT_PURPOSES.flatMap((purpose) => {
		const row = latest.get(purpose);
		return row ? [row] : [];
	});
}

/** Inserts one decision. The previous row for that purpose is left as it was. */
export async function recordConsent(
	database: ConsentDb,
	input: {
		userId: number;
		purpose: ConsentPurpose;
		granted: boolean;
		ip?: string;
	},
): Promise<StoredConsent> {
	const [person] = await database
		.select({ dateOfBirth: users.dateOfBirth })
		.from(users)
		.where(eq(users.id, input.userId))
		.limit(1);
	const minor = person?.dateOfBirth ? isUnder18(person.dateOfBirth) : false;
	if (minor && input.granted && RESTRICTED_FOR_MINORS.includes(input.purpose)) {
		throw errors.badRequest(
			"Public passport and mentor contact stay off until the learner is 18.",
			{ reason: "minor_visibility" },
		);
	}
	if (minor && input.purpose === "guardian" && !input.granted) {
		throw errors.badRequest(
			"A learner under 18 needs a guardian and their consent.",
			{ reason: "guardian_required" },
		);
	}

	const grantedAt = new Date();
	await database.transaction(async (tx) => {
		await tx.insert(consents).values({
			userId: input.userId,
			purpose: input.purpose,
			granted: input.granted,
			version: CONSENT_VERSION,
			grantedAt,
		});
		await writeAudit(tx, {
			actorId: input.userId,
			action: "consent.recorded",
			targetType: "user",
			targetId: String(input.userId),
			ipAddress: input.ip,
			metadata: {
				purpose: input.purpose,
				granted: input.granted,
				version: CONSENT_VERSION,
			},
		});
	});
	return {
		purpose: input.purpose,
		granted: input.granted,
		version: CONSENT_VERSION,
		grantedAt,
	};
}
