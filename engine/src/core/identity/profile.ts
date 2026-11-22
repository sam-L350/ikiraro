import { eq } from "drizzle-orm";
import type { Database } from "../../db";
import { users } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { isUnder18, parseDateOfBirth } from "./age";
import { currentConsents, type StoredConsent } from "./consent";
import { visibleEmail } from "./register";

type ProfileDb = Pick<Database, "insert" | "select" | "update" | "transaction">;

export type Profile = {
	id: number;
	name: string | null;
	phone: string | null;
	email: string | null;
	dateOfBirth: string | null;
	gender: string | null;
	district: string | null;
	sector: string | null;
	village: string | null;
	economicSector: string | null;
	locale: string;
	photoKey: string | null;
	guardianContact: string | null;
	minor: boolean;
	active: boolean;
	consents: StoredConsent[];
};

export type ProfilePatch = {
	name?: string;
	dateOfBirth?: string;
	gender?: string | null;
	district?: string;
	sector?: string;
	village?: string;
	economicSector?: string;
	locale?: "rw" | "en";
	photoKey?: string | null;
	guardianContact?: string | null;
};

function blank(value: string | null | undefined): string | null {
	const trimmed = value?.trim() ?? "";
	return trimmed ? trimmed : null;
}

export async function readProfile(
	database: Pick<Database, "select">,
	userId: number,
): Promise<Profile> {
	const [person] = await database
		.select({
			id: users.id,
			name: users.name,
			phone: users.phone,
			email: users.email,
			dateOfBirth: users.dateOfBirth,
			gender: users.gender,
			district: users.district,
			sector: users.sector,
			village: users.village,
			economicSector: users.economicSector,
			locale: users.locale,
			photoKey: users.photoKey,
			guardianContact: users.guardianContact,
			activatedAt: users.activatedAt,
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!person) throw errors.notFound("This profile does not exist.");

	return {
		id: person.id,
		name: person.name,
		phone: person.phone,
		email: visibleEmail(person.email),
		dateOfBirth: person.dateOfBirth,
		gender: person.gender,
		district: person.district,
		sector: person.sector,
		village: person.village,
		economicSector: person.economicSector,
		locale: person.locale,
		photoKey: person.photoKey,
		guardianContact: person.guardianContact,
		minor: person.dateOfBirth ? isUnder18(person.dateOfBirth) : false,
		active: person.activatedAt !== null,
		consents: await currentConsents(database, userId),
	};
}

export async function updateProfile(
	database: ProfileDb,
	userId: number,
	patch: ProfilePatch,
	ip: string,
): Promise<Profile> {
	const current = await readProfile(database, userId);
	const nextDate = patch.dateOfBirth
		? parseDateOfBirth(patch.dateOfBirth)
		: current.dateOfBirth;
	const nextGuardian =
		patch.guardianContact !== undefined
			? blank(patch.guardianContact)
			: current.guardianContact;
	if (nextDate && isUnder18(nextDate) && !nextGuardian) {
		throw errors.badRequest(
			"A learner under 18 needs a guardian and their consent.",
			{ reason: "guardian_required" },
		);
	}

	const name = keptText(patch.name, "invalid_name", "Enter a name.");
	const district = keptText(
		patch.district,
		"invalid_place",
		"Enter a district.",
	);
	const sector = keptText(patch.sector, "invalid_place", "Enter a sector.");
	const village = keptText(patch.village, "invalid_place", "Enter a village.");
	const economicSector = keptText(
		patch.economicSector,
		"invalid_place",
		"Enter the kind of work.",
	);

	await database.transaction(async (tx) => {
		await tx
			.update(users)
			.set({
				name,
				dateOfBirth: patch.dateOfBirth === undefined ? undefined : nextDate,
				gender: patch.gender === undefined ? undefined : blank(patch.gender),
				district,
				sector,
				village,
				economicSector,
				locale: patch.locale,
				photoKey:
					patch.photoKey === undefined ? undefined : blank(patch.photoKey),
				guardianContact:
					patch.guardianContact === undefined ? undefined : nextGuardian,
			})
			.where(eq(users.id, userId));
		await writeAudit(tx, {
			actorId: userId,
			action: "profile.updated",
			targetType: "user",
			targetId: String(userId),
			ipAddress: ip,
			metadata: { fields: Object.keys(patch) },
		});
	});
	return readProfile(database, userId);
}

function keptText(
	value: string | undefined,
	reason: string,
	message: string,
): string | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	if (!trimmed) throw errors.badRequest(message, { reason });
	return trimmed;
}
