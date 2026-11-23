import { eq, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	consents,
	declaredRelationships,
	digitalPassports,
	pointTransactions,
	privacyRequests,
	taskSubmissions,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { applyLearnerRls } from "../privacy/rls";

const FIELDS = [
	"name",
	"district",
	"sector",
	"village",
	"economicSector",
	"guardianContact",
] as const;

export type CorrectionField = (typeof FIELDS)[number];

const LIMITS: Record<CorrectionField, number> = {
	name: 120,
	district: 80,
	sector: 80,
	village: 80,
	economicSector: 80,
	guardianContact: 120,
};

export function isCorrectionField(value: string): value is CorrectionField {
	return (FIELDS as readonly string[]).includes(value);
}

export type SubjectExport = {
	profile: {
		id: number;
		name: string | null;
		email: string;
		phone: string | null;
		district: string | null;
		sector: string | null;
		village: string | null;
		economicSector: string | null;
		locale: string;
		guardianContact: string | null;
	};
	consents: {
		purpose: string;
		granted: boolean;
		version: string;
		grantedAt: string;
	}[];
	submissions: {
		id: string;
		status: string;
		evidenceType: string;
		note: string | null;
		submittedAt: string | null;
	}[];
	passport: { verifiedMinutes: number; shared: boolean };
	ledger: { count: number; total: number };
	requests: { kind: string; status: string; createdAt: string }[];
	relationships: { kind: string; contact: string | null }[];
};

type SubjectDb = Pick<Database, "insert" | "select" | "transaction" | "update">;

function cleanValue(field: CorrectionField, value: string): string | null {
	const trimmed = value.trim().slice(0, LIMITS[field]);
	if (field === "name" && !trimmed) {
		throw errors.badRequest("A name is required.", { reason: "value" });
	}
	return trimmed || null;
}

export async function exportSubject(
	database: SubjectDb,
	input: { subjectId: number; actorId: number; ip: string },
): Promise<SubjectExport> {
	return database.transaction(async (tx) => {
		await applyLearnerRls(tx, { userId: input.subjectId, scope: "self" });
		const [person] = await tx
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				phone: users.phone,
				district: users.district,
				sector: users.sector,
				village: users.village,
				economicSector: users.economicSector,
				locale: users.locale,
				guardianContact: users.guardianContact,
			})
			.from(users)
			.where(eq(users.id, input.subjectId))
			.limit(1);
		if (!person) throw errors.notFound("That person is not on the record.");

		const consentRows = await tx
			.select({
				purpose: consents.purpose,
				granted: consents.granted,
				version: consents.version,
				grantedAt: consents.grantedAt,
			})
			.from(consents)
			.where(eq(consents.userId, input.subjectId));
		const submissionRows = await tx
			.select({
				id: taskSubmissions.id,
				status: taskSubmissions.status,
				evidenceType: taskSubmissions.evidenceType,
				note: taskSubmissions.note,
				submittedAt: taskSubmissions.submittedAt,
			})
			.from(taskSubmissions)
			.where(eq(taskSubmissions.ownerUserId, input.subjectId));
		const [passport] = await tx
			.select({
				verifiedMinutes: digitalPassports.verifiedMinutes,
				token: digitalPassports.publicShareToken,
			})
			.from(digitalPassports)
			.where(eq(digitalPassports.userId, input.subjectId))
			.limit(1);
		const [ledger] = await tx
			.select({
				count: sql<number>`count(*)::int`,
				total: sql<number>`coalesce(sum(${pointTransactions.amount}), 0)::int`,
			})
			.from(pointTransactions)
			.where(eq(pointTransactions.userId, input.subjectId));
		const relationshipRows = await tx
			.select({
				kind: declaredRelationships.kind,
				contact: declaredRelationships.contact,
			})
			.from(declaredRelationships)
			.where(eq(declaredRelationships.userId, input.subjectId));
		const requestRows = await tx
			.select({
				kind: privacyRequests.kind,
				status: privacyRequests.status,
				createdAt: privacyRequests.createdAt,
			})
			.from(privacyRequests)
			.where(eq(privacyRequests.userId, input.subjectId));

		await writeAudit(tx, {
			actorId: input.actorId,
			action: "privacy.exported",
			targetType: "user",
			targetId: String(input.subjectId),
			ipAddress: input.ip,
		});

		return {
			profile: person,
			consents: consentRows.map((row) => ({
				purpose: row.purpose,
				granted: row.granted,
				version: row.version,
				grantedAt: row.grantedAt.toISOString(),
			})),
			submissions: submissionRows.map((row) => ({
				id: row.id,
				status: row.status,
				evidenceType: row.evidenceType,
				note: row.note,
				submittedAt: row.submittedAt?.toISOString() ?? null,
			})),
			passport: {
				verifiedMinutes: passport?.verifiedMinutes ?? 0,
				shared: Boolean(passport?.token),
			},
			ledger: { count: ledger?.count ?? 0, total: ledger?.total ?? 0 },
			requests: requestRows.map((row) => ({
				kind: row.kind,
				status: row.status,
				createdAt: row.createdAt.toISOString(),
			})),
			relationships: relationshipRows,
		};
	});
}

export async function correctSubject(
	database: SubjectDb,
	input: {
		subjectId: number;
		actorId: number;
		field: string;
		value: string;
		ip: string;
	},
): Promise<{ field: CorrectionField; value: string | null }> {
	if (!isCorrectionField(input.field)) {
		throw errors.badRequest("That detail cannot be corrected here.", {
			reason: "field",
		});
	}
	const field = input.field;
	const next = cleanValue(field, input.value);
	return database.transaction(async (tx) => {
		await applyLearnerRls(tx, { userId: input.subjectId, scope: "self" });
		const [person] = await tx
			.select({
				name: users.name,
				district: users.district,
				sector: users.sector,
				village: users.village,
				economicSector: users.economicSector,
				guardianContact: users.guardianContact,
				deletedAt: users.deletedAt,
			})
			.from(users)
			.where(eq(users.id, input.subjectId))
			.limit(1);
		if (!person) throw errors.notFound("That person is not on the record.");
		if (person.deletedAt) {
			throw errors.conflict("This record has already been removed.", {
				reason: "closed",
			});
		}
		const previous = person[field];
		await tx
			.update(users)
			.set({ [field]: next })
			.where(eq(users.id, input.subjectId));
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "privacy.corrected",
			targetType: "user",
			targetId: String(input.subjectId),
			ipAddress: input.ip,
			metadata: {
				field,
				previous: previous ?? "",
				next: next ?? "",
			},
		});
		return { field, value: next };
	});
}
