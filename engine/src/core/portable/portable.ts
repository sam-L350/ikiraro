import { createHash } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { env } from "../../config/env";
import type { Database } from "../../db";
import {
	roles,
	softwareLicenceGrants,
	softwareLicenceRevocations,
	softwareLicences,
	userRoles,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { ROLE_PERMISSIONS } from "../authz/catalog";
import type { Assignment } from "../authz/decide";
import { readPassport } from "../learning/passport";

type PortableDb = Database;

export type LicenceHolder = {
	grantId: string;
	name: string;
};

export type LicenceLearner = {
	id: number;
	name: string;
};

export type LicenceRow = {
	id: string;
	name: string;
	seats: number;
	seatsUsed: number;
	expiresOn: string;
	holders: LicenceHolder[];
};

export type LicenceList = {
	licences: LicenceRow[];
	learners: LicenceLearner[];
};

function canManage(assignments: readonly Assignment[]): boolean {
	return assignments.some((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes("hardware.manage"),
	);
}

function requireOfficer(assignments: readonly Assignment[]): void {
	if (!canManage(assignments)) {
		throw errors.forbidden("A hardware officer grants a licence.", {
			reason: "licence",
		});
	}
}

function isUnique(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 5; depth += 1) {
		if (typeof current === "object" && current !== null && "code" in current) {
			if (current.code === "23505") return true;
		}
		if (current instanceof Error && current.cause) {
			current = current.cause;
			continue;
		}
		return false;
	}
	return false;
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value,
	);
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function requireName(value: string): string {
	const name = value.trim();
	if (name.length < 1 || name.length > 80) {
		throw errors.badRequest("Write the licence name.", { reason: "licence" });
	}
	return name;
}

function requireSeats(value: number): number {
	if (!Number.isInteger(value) || value < 1 || value > 10000) {
		throw errors.badRequest("Write how many seats.", { reason: "licence" });
	}
	return value;
}

function requireExpiry(value: string): string {
	const trimmed = value.trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		throw errors.badRequest("Write the expiry date.", { reason: "licence" });
	}
	const parsed = new Date(`${trimmed}T00:00:00.000Z`);
	if (
		Number.isNaN(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== trimmed
	) {
		throw errors.badRequest("Write the expiry date.", { reason: "licence" });
	}
	if (trimmed < today()) {
		throw errors.badRequest("Write an expiry that is still ahead.", {
			reason: "licence",
		});
	}
	return trimmed;
}

/** Seats still free, and the learners an officer can choose. */
export async function readLicences(
	database: PortableDb,
	assignments: readonly Assignment[],
): Promise<LicenceList> {
	requireOfficer(assignments);
	const stored = await database
		.select({
			id: softwareLicences.id,
			name: softwareLicences.name,
			seats: softwareLicences.seats,
			expiresOn: softwareLicences.expiresOn,
		})
		.from(softwareLicences)
		.orderBy(softwareLicences.name);
	const grants =
		stored.length === 0
			? []
			: await database
					.select({
						id: softwareLicenceGrants.id,
						licenceId: softwareLicenceGrants.licenceId,
						name: users.name,
					})
					.from(softwareLicenceGrants)
					.innerJoin(users, eq(users.id, softwareLicenceGrants.userId))
					.where(
						inArray(
							softwareLicenceGrants.licenceId,
							stored.map((row) => row.id),
						),
					);
	const revoked = new Set(
		grants.length === 0
			? []
			: (
					await database
						.select({ grantId: softwareLicenceRevocations.grantId })
						.from(softwareLicenceRevocations)
						.where(
							inArray(
								softwareLicenceRevocations.grantId,
								grants.map((row) => row.id),
							),
						)
				).map((row) => row.grantId),
	);
	const licences = stored.map((row) => {
		const active = grants.filter(
			(grant) => grant.licenceId === row.id && !revoked.has(grant.id),
		);
		return {
			id: row.id,
			name: row.name,
			seats: row.seats,
			seatsUsed: active.length,
			expiresOn: row.expiresOn,
			holders: active.flatMap((grant) => {
				const name = grant.name?.trim() ?? "";
				return name ? [{ grantId: grant.id, name }] : [];
			}),
		};
	});
	const people = await database
		.select({ id: users.id, name: users.name })
		.from(users)
		.innerJoin(userRoles, eq(userRoles.userId, users.id))
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(
			and(
				eq(roles.code, "learner"),
				isNull(userRoles.suspendedAt),
				isNull(users.deletedAt),
			),
		);
	const learners = people
		.flatMap((person) => {
			const name = person.name?.trim() ?? "";
			return name ? [{ id: person.id, name }] : [];
		})
		.sort((left, right) => left.name.localeCompare(right.name));
	return { licences, learners };
}

/** Store a donated program. The seat count and the end date do not change later. */
export async function createLicence(
	database: PortableDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		name: string;
		seats: number;
		expiresOn: string;
		ip?: string;
	},
): Promise<LicenceRow> {
	requireOfficer(input.assignments);
	const name = requireName(input.name);
	const seats = requireSeats(input.seats);
	const expiresOn = requireExpiry(input.expiresOn);
	const [created] = await database
		.insert(softwareLicences)
		.values({
			name,
			seats,
			expiresOn,
			createdByUserId: input.actorId,
		})
		.returning({ id: softwareLicences.id });
	if (!created) throw errors.internal("The licence was not stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "licence.created",
		targetType: "software_licence",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: { seats },
	});
	return {
		id: created.id,
		name,
		seats,
		seatsUsed: 0,
		expiresOn,
		holders: [],
	};
}

async function learnerName(
	database: PortableDb,
	userId: number,
): Promise<string | null> {
	const [person] = await database
		.select({ name: users.name })
		.from(users)
		.innerJoin(userRoles, eq(userRoles.userId, users.id))
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(
			and(
				eq(users.id, userId),
				eq(roles.code, "learner"),
				isNull(userRoles.suspendedAt),
				isNull(users.deletedAt),
			),
		)
		.limit(1);
	const name = person?.name?.trim() ?? "";
	return name || null;
}

/** Give one free seat to a learner. */
export async function grantLicenceSeat(
	database: PortableDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		licenceId: string;
		userId: number;
		ip?: string;
	},
): Promise<{ grantId: string }> {
	requireOfficer(input.assignments);
	if (!isUuid(input.licenceId)) {
		throw errors.notFound("This licence was not found.");
	}
	const [licence] = await database
		.select({
			id: softwareLicences.id,
			seats: softwareLicences.seats,
			expiresOn: softwareLicences.expiresOn,
		})
		.from(softwareLicences)
		.where(eq(softwareLicences.id, input.licenceId))
		.limit(1);
	if (!licence) throw errors.notFound("This licence was not found.");
	if (licence.expiresOn < today()) {
		throw errors.badRequest("This licence has expired.", { reason: "licence" });
	}
	const name = await learnerName(database, input.userId);
	if (!name) {
		throw errors.badRequest("Choose a learner.", { reason: "licence" });
	}
	const grants = await database
		.select({
			id: softwareLicenceGrants.id,
			userId: softwareLicenceGrants.userId,
		})
		.from(softwareLicenceGrants)
		.where(eq(softwareLicenceGrants.licenceId, licence.id));
	const revoked = new Set(
		grants.length === 0
			? []
			: (
					await database
						.select({ grantId: softwareLicenceRevocations.grantId })
						.from(softwareLicenceRevocations)
						.where(
							inArray(
								softwareLicenceRevocations.grantId,
								grants.map((row) => row.id),
							),
						)
				).map((row) => row.grantId),
	);
	const active = grants.filter((row) => !revoked.has(row.id));
	if (active.some((row) => row.userId === input.userId)) {
		throw errors.conflict("This person already has a seat.", {
			reason: "licence",
		});
	}
	if (active.length >= licence.seats) {
		throw errors.conflict("Every seat is in use.", { reason: "licence" });
	}
	const [created] = await database
		.insert(softwareLicenceGrants)
		.values({
			licenceId: licence.id,
			userId: input.userId,
			grantedByUserId: input.actorId,
		})
		.returning({ id: softwareLicenceGrants.id });
	if (!created) throw errors.internal("The seat was not stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "licence.granted",
		targetType: "software_licence_grant",
		targetId: created.id,
		ipAddress: input.ip,
	});
	return { grantId: created.id };
}

/** Free a seat. The grant stays in the record. */
export async function revokeLicenceSeat(
	database: PortableDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		grantId: string;
		ip?: string;
	},
): Promise<{ grantId: string }> {
	requireOfficer(input.assignments);
	if (!isUuid(input.grantId)) throw errors.notFound("This seat was not found.");
	const [grant] = await database
		.select({ id: softwareLicenceGrants.id })
		.from(softwareLicenceGrants)
		.where(eq(softwareLicenceGrants.id, input.grantId))
		.limit(1);
	if (!grant) throw errors.notFound("This seat was not found.");
	const [existing] = await database
		.select({ grantId: softwareLicenceRevocations.grantId })
		.from(softwareLicenceRevocations)
		.where(eq(softwareLicenceRevocations.grantId, grant.id))
		.limit(1);
	if (existing) {
		throw errors.conflict("This seat is already free.", { reason: "licence" });
	}
	try {
		await database.insert(softwareLicenceRevocations).values({
			grantId: grant.id,
			revokedByUserId: input.actorId,
		});
	} catch (error) {
		if (isUnique(error)) {
			throw errors.conflict("This seat is already free.", {
				reason: "licence",
			});
		}
		throw error;
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "licence.revoked",
		targetType: "software_licence_grant",
		targetId: grant.id,
		ipAddress: input.ip,
	});
	return { grantId: grant.id };
}

function identityHash(email: string, salt: string): string {
	return createHash("sha256").update(`${email}${salt}`).digest("hex");
}

/**
 * An Open Badges assertion for a badge on this person's passport.
 * The email stays out. The public token is how someone else checks it.
 */
export async function exportOpenBadge(
	database: PortableDb,
	input: { userId: number; badgeId: string },
): Promise<{ json: string }> {
	const passport = await readPassport(database, input.userId);
	const badge = passport.badges.find((row) => row.id === input.badgeId);
	if (!badge?.credentialToken) {
		throw errors.notFound("This badge is not on your passport.");
	}
	const [person] = await database
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, input.userId))
		.limit(1);
	if (!person) throw errors.notFound("This badge is not on your passport.");
	const token = badge.credentialToken;
	const check = `${env.apiUrl}/api/v1/credentials/check?token=${token}`;
	const name =
		badge.titleEn.trim() || badge.titleRw.trim() || badge.skillEn.trim();
	const description = badge.skillEn.trim() || name;
	const assertion: Record<string, unknown> = {
		"@context": "https://w3id.org/openbadges/v2",
		type: "Assertion",
		id: check,
		recipient: {
			type: "email",
			hashed: true,
			identity: `sha256$${identityHash(person.email, token)}`,
			salt: token,
		},
		issuedOn: badge.awardedAt,
		badge: {
			type: "BadgeClass",
			id: check,
			name,
			description,
			level: badge.level,
			issuer: {
				type: "Issuer",
				id: env.apiUrl,
				name: "Ikiraro",
			},
		},
		verification: { type: "hosted", url: check },
	};
	if (badge.expiresAt) assertion.expires = badge.expiresAt;
	return { json: JSON.stringify(assertion) };
}
