import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db";
import {
	centerStaff,
	digitalPassports,
	earnedBadges,
	enrollments,
	learningCenters,
	mediaObjects,
	submissionVerifications,
	taskSubmissions,
	users,
	verificationRevocations,
} from "../../db/schema";
import type { JsonValue } from "../../db/schema/compliance";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { isUnder18 } from "../identity/age";
import { currentConsents } from "../identity/consent";
import { readPassport, shownReferrals } from "./passport";

const NOT_FOUND = "This passport link is not valid.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const AUTHORITY_ROLES = [
	"trainer",
	"center_manager",
	"district_coordinator",
	"reviewer",
] as const;

export type AuthorityRole = (typeof AUTHORITY_ROLES)[number];
export type ShareBlock = "ok" | "minor" | "birth" | "consent";

export type PublicBadge = {
	id: string;
	titleEn: string;
	titleRw: string;
	skillEn: string;
	skillRw: string;
	awardedAt: string;
	verifierName: string;
	authorityRole: AuthorityRole;
	centerName: string;
	verifiedAt: string;
};

export type PublicTask = {
	id: string;
	titleEn: string;
	titleRw: string;
	completedAt: string | null;
	verifierName: string;
	authorityRole: AuthorityRole;
	centerName: string;
	verifiedAt: string;
};

export type PublicEvidence = {
	id: string;
	contentType: string;
	url: string | null;
};

export type PublicPassport = {
	name: string;
	photoUrl: string | null;
	centerName: string | null;
	hours: number | null;
	verifiedMinutes: number | null;
	points: number | null;
	level: number | null;
	phone: string | null;
	village: string | null;
	badges: PublicBadge[];
	tasks: PublicTask[];
	evidence: PublicEvidence[];
	referrals: { id: string; authorName: string; note: string }[];
};

export type ShareItem = {
	id: string;
	titleEn: string;
	titleRw: string;
	shown: boolean;
};

export type ShareEvidenceItem = {
	id: string;
	contentType: string;
	shown: boolean;
};

export type ShareSettings = {
	block: ShareBlock;
	token: string | null;
	photo: boolean;
	center: boolean;
	hours: boolean;
	points: boolean;
	level: boolean;
	phone: boolean;
	village: boolean;
	badges: ShareItem[];
	tasks: ShareItem[];
	evidence: ShareEvidenceItem[];
};

export type ShareVisibilityInput = {
	photo?: boolean;
	center?: boolean;
	hours?: boolean;
	points?: boolean;
	level?: boolean;
	phone?: boolean;
	village?: boolean;
	hiddenBadges?: string[];
	hiddenTasks?: string[];
	publicEvidence?: string[];
};

type ShareDb = Pick<Database, "select" | "insert" | "update" | "transaction">;

type Flags = {
	photo: boolean;
	center: boolean;
	hours: boolean;
	points: boolean;
	level: boolean;
	phone: boolean;
	village: boolean;
	hiddenBadges: string[];
	hiddenTasks: string[];
	publicEvidence: string[];
};

type Verifier = {
	name: string;
	role: AuthorityRole;
	centerName: string;
	verifiedAt: string;
};

type ObjectSigner = (objectKey: string) => Promise<string | null>;

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const ids: string[] = [];
	for (const item of value) {
		if (typeof item !== "string" || !UUID.test(item)) continue;
		if (!ids.includes(item)) ids.push(item.toLowerCase());
		if (ids.length >= 100) break;
	}
	return ids;
}

function readFlags(value: unknown): Flags {
	const record = asRecord(value) ?? {};
	return {
		photo: record.photo !== false,
		center: record.center !== false,
		hours: record.hours !== false,
		points: record.points !== false,
		level: record.level !== false,
		phone: record.phone === true,
		village: record.village === true,
		hiddenBadges: stringList(record.hiddenBadges),
		hiddenTasks: stringList(record.hiddenTasks),
		publicEvidence: stringList(record.publicEvidence),
	};
}

function storedFlags(flags: Flags): JsonValue {
	return {
		photo: flags.photo,
		center: flags.center,
		hours: flags.hours,
		points: flags.points,
		level: flags.level,
		phone: flags.phone,
		village: flags.village,
		hiddenBadges: flags.hiddenBadges,
		hiddenTasks: flags.hiddenTasks,
		publicEvidence: flags.publicEvidence,
	};
}

export function authorityRole(value: string | null): AuthorityRole {
	switch (value) {
		case "trainer":
		case "center_manager":
		case "district_coordinator":
		case "reviewer":
			return value;
		case "manager":
			return "center_manager";
		default:
			return "reviewer";
	}
}

function shareBlock(dateOfBirth: string | null, consent: boolean): ShareBlock {
	if (!dateOfBirth) return "birth";
	if (isUnder18(dateOfBirth)) return "minor";
	if (!consent) return "consent";
	return "ok";
}

function publicPicture(value: string | null): string | null {
	if (!value?.startsWith("https://") || value.length > 500) return null;
	return value;
}

function isImage(contentType: string): boolean {
	switch (contentType) {
		case "image/jpeg":
		case "image/png":
		case "image/webp":
			return true;
		default:
			return false;
	}
}

async function passportConsent(
	database: Pick<Database, "select">,
	userId: number,
): Promise<boolean> {
	const rows = await currentConsents(database, userId);
	return rows.some((row) => row.purpose === "public_passport" && row.granted);
}

async function personOf(database: Pick<Database, "select">, userId: number) {
	const [person] = await database
		.select({
			dateOfBirth: users.dateOfBirth,
			deletedAt: users.deletedAt,
			deactivatedAt: users.deactivatedAt,
			name: users.name,
			phone: users.phone,
			village: users.village,
			picture: users.picture,
			photoKey: users.photoKey,
			centerId: users.centerId,
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return person ?? null;
}

function notPublic(): never {
	throw errors.notFound(NOT_FOUND);
}

/** What the signed-in learner can show, and the live token if there is one. */
export async function readShareSettings(
	database: ShareDb,
	userId: number,
): Promise<ShareSettings> {
	const person = await personOf(database, userId);
	if (!person) throw errors.notFound("This profile does not exist.");
	const consent = await passportConsent(database, userId);
	const [passport] = await database
		.select({
			token: digitalPassports.publicShareToken,
			visibility: digitalPassports.visibility,
		})
		.from(digitalPassports)
		.where(eq(digitalPassports.userId, userId))
		.limit(1);
	const flags = readFlags(passport?.visibility);
	const owned = await readPassport(database, userId);
	const evidence = await listEvidence(database, userId);
	const hiddenBadges = new Set(flags.hiddenBadges);
	const hiddenTasks = new Set(flags.hiddenTasks);
	const pinned = new Set(flags.publicEvidence);
	return {
		block: shareBlock(person.dateOfBirth, consent),
		token: passport?.token ?? null,
		photo: flags.photo,
		center: flags.center,
		hours: flags.hours,
		points: flags.points,
		level: flags.level,
		phone: flags.phone,
		village: flags.village,
		badges: owned.badges.map((badge) => ({
			id: badge.id,
			titleEn: badge.titleEn,
			titleRw: badge.titleRw,
			shown: !hiddenBadges.has(badge.id.toLowerCase()),
		})),
		tasks: owned.tasks.map((task) => ({
			id: task.id,
			titleEn: task.titleEn,
			titleRw: task.titleRw,
			shown: !hiddenTasks.has(task.id.toLowerCase()),
		})),
		evidence: evidence.map((item) => ({
			id: item.id,
			contentType: item.contentType,
			shown: pinned.has(item.id.toLowerCase()),
		})),
	};
}

/** Replace the live token. The previous link stops resolving. */
export async function rotateShareToken(
	database: ShareDb,
	input: { userId: number; ip: string },
): Promise<{ token: string }> {
	const person = await personOf(database, input.userId);
	if (!person || person.deletedAt || person.deactivatedAt) {
		throw errors.notFound("This profile does not exist.");
	}
	const consent = await passportConsent(database, input.userId);
	const block = shareBlock(person.dateOfBirth, consent);
	switch (block) {
		case "birth":
			throw errors.badRequest(
				"Add a date of birth. A public page stays off until it shows you are 18.",
				{ reason: "birth" },
			);
		case "minor":
			throw errors.badRequest(
				"Public passport and mentor contact stay off until the learner is 18.",
				{ reason: "minor_visibility" },
			);
		case "consent":
			throw errors.badRequest(
				"Turn on the public passport before a stranger can open it.",
				{ reason: "passport_consent" },
			);
		case "ok":
			break;
		default: {
			const unreachable: never = block;
			throw errors.internal(unreachable);
		}
	}
	const token = randomBytes(32).toString("base64url");
	await database.transaction(async (tx) => {
		const [updated] = await tx
			.update(digitalPassports)
			.set({ publicShareToken: token })
			.where(eq(digitalPassports.userId, input.userId))
			.returning({ id: digitalPassports.id });
		if (!updated) throw errors.internal("The passport was not stored.");
		await writeAudit(tx, {
			actorId: input.userId,
			action: "passport.share_rotated",
			targetType: "digital_passport",
			targetId: updated.id,
			ipAddress: input.ip,
		});
	});
	return { token };
}

/** Turn the public link off. The current token dies. */
export async function revokeShareToken(
	database: ShareDb,
	input: { userId: number; ip: string },
): Promise<{ token: null }> {
	await database.transaction(async (tx) => {
		const [updated] = await tx
			.update(digitalPassports)
			.set({ publicShareToken: null })
			.where(eq(digitalPassports.userId, input.userId))
			.returning({ id: digitalPassports.id });
		if (!updated) throw errors.notFound("This profile does not exist.");
		await writeAudit(tx, {
			actorId: input.userId,
			action: "passport.share_revoked",
			targetType: "digital_passport",
			targetId: updated.id,
			ipAddress: input.ip,
		});
	});
	return { token: null };
}

/** Save which items a stranger may see. This does not create a link. */
export async function saveShareVisibility(
	database: ShareDb,
	input: ShareVisibilityInput & { userId: number; ip: string },
): Promise<ShareSettings> {
	const [passport] = await database
		.select({ visibility: digitalPassports.visibility })
		.from(digitalPassports)
		.where(eq(digitalPassports.userId, input.userId))
		.limit(1);
	if (!passport) throw errors.notFound("This profile does not exist.");
	const current = readFlags(passport.visibility);
	const owned = await ownedIds(database, input.userId);
	const next: Flags = {
		photo: input.photo ?? current.photo,
		center: input.center ?? current.center,
		hours: input.hours ?? current.hours,
		points: input.points ?? current.points,
		level: input.level ?? current.level,
		phone: input.phone ?? current.phone,
		village: input.village ?? current.village,
		hiddenBadges: (input.hiddenBadges
			? stringList(input.hiddenBadges)
			: current.hiddenBadges
		).filter((id) => owned.badges.has(id)),
		hiddenTasks: (input.hiddenTasks
			? stringList(input.hiddenTasks)
			: current.hiddenTasks
		).filter((id) => owned.tasks.has(id)),
		publicEvidence: (input.publicEvidence
			? stringList(input.publicEvidence)
			: current.publicEvidence
		).filter((id) => owned.evidence.has(id)),
	};
	await database.transaction(async (tx) => {
		const [updated] = await tx
			.update(digitalPassports)
			.set({ visibility: storedFlags(next) })
			.where(eq(digitalPassports.userId, input.userId))
			.returning({ id: digitalPassports.id });
		if (!updated) throw errors.notFound("This profile does not exist.");
		await writeAudit(tx, {
			actorId: input.userId,
			action: "passport.visibility_saved",
			targetType: "digital_passport",
			targetId: updated.id,
			ipAddress: input.ip,
		});
	});
	return readShareSettings(database, input.userId);
}

/**
 * The page a stranger opens. A dead token, a withdrawn consent, and a minor
 * all look the same: the link is not valid.
 */
export async function readPublicPassport(
	database: ShareDb,
	token: string,
	options?: { signObject?: ObjectSigner },
): Promise<PublicPassport> {
	const trimmed = token.trim();
	if (trimmed.length < 43 || trimmed.length > 80) notPublic();
	const [row] = await database
		.select({
			userId: digitalPassports.userId,
			visibility: digitalPassports.visibility,
		})
		.from(digitalPassports)
		.where(eq(digitalPassports.publicShareToken, trimmed))
		.limit(1);
	if (!row) notPublic();
	const person = await personOf(database, row.userId);
	if (!person || person.deletedAt || person.deactivatedAt) notPublic();
	const consent = await passportConsent(database, row.userId);
	if (shareBlock(person.dateOfBirth, consent) !== "ok") notPublic();

	const flags = readFlags(row.visibility);
	const owned = await readPassport(database, row.userId);
	const hiddenBadges = new Set(flags.hiddenBadges);
	const hiddenTasks = new Set(flags.hiddenTasks);
	const badgeVerifiers = await verifiersForBadges(database, row.userId);
	const taskVerifiers = await verifiersForTasks(database, row.userId);
	const badges = owned.badges
		.filter((badge) => !hiddenBadges.has(badge.id.toLowerCase()))
		.map((badge) => {
			const verifier = badgeVerifiers.get(badge.id);
			return {
				id: badge.id,
				titleEn: badge.titleEn,
				titleRw: badge.titleRw,
				skillEn: badge.skillEn,
				skillRw: badge.skillRw,
				awardedAt: badge.awardedAt,
				verifierName: verifier?.name ?? "",
				authorityRole: verifier?.role ?? "reviewer",
				centerName: verifier?.centerName ?? "",
				verifiedAt: verifier?.verifiedAt ?? badge.awardedAt,
			};
		});
	const tasks = owned.tasks
		.filter((task) => !hiddenTasks.has(task.id.toLowerCase()))
		.map((task) => {
			const verifier = taskVerifiers.get(task.id);
			return {
				id: task.id,
				titleEn: task.titleEn,
				titleRw: task.titleRw,
				completedAt: task.completedAt,
				verifierName: verifier?.name ?? "",
				authorityRole: verifier?.role ?? "reviewer",
				centerName: verifier?.centerName ?? "",
				verifiedAt: verifier?.verifiedAt ?? task.completedAt ?? "",
			};
		});
	const level = flags.level
		? maxLevel(
				owned.badges.filter(
					(badge) => !hiddenBadges.has(badge.id.toLowerCase()),
				),
			)
		: null;
	const evidence = await publicEvidence(
		database,
		row.userId,
		flags.publicEvidence,
		options?.signObject,
	);
	const photoUrl = flags.photo
		? (publicPicture(person.picture) ??
			(person.photoKey && options?.signObject
				? await options.signObject(person.photoKey)
				: null))
		: null;
	return {
		name: person.name?.trim() || "",
		photoUrl,
		centerName: flags.center
			? await centerName(database, row.userId, person.centerId)
			: null,
		hours: flags.hours ? owned.hours : null,
		verifiedMinutes: flags.hours ? owned.verifiedMinutes : null,
		points: flags.points ? owned.points : null,
		level,
		phone: flags.phone ? person.phone : null,
		village: flags.village ? person.village : null,
		badges,
		tasks,
		evidence,
		referrals: await shownReferrals(database, row.userId),
	};
}

function maxLevel(badges: { level: number }[]): number | null {
	return badges.reduce<number | null>(
		(highest, badge) =>
			highest === null || badge.level > highest ? badge.level : highest,
		null,
	);
}

async function centerName(
	database: Pick<Database, "select">,
	userId: number,
	homeCenterId: string | null,
): Promise<string | null> {
	if (homeCenterId) {
		const [home] = await database
			.select({ name: learningCenters.name })
			.from(learningCenters)
			.where(eq(learningCenters.id, homeCenterId))
			.limit(1);
		if (home) return home.name;
	}
	const [enrolled] = await database
		.select({ name: learningCenters.name })
		.from(enrollments)
		.innerJoin(learningCenters, eq(learningCenters.id, enrollments.centerId))
		.where(eq(enrollments.userId, userId))
		.orderBy(desc(enrollments.startedAt))
		.limit(1);
	return enrolled?.name ?? null;
}

async function verifiersForBadges(
	database: Pick<Database, "select">,
	userId: number,
): Promise<Map<string, Verifier>> {
	const rows = await database
		.select({
			badgeId: earnedBadges.badgeId,
			entry: earnedBadges.entry,
			name: users.name,
			role: centerStaff.role,
			centerName: learningCenters.name,
			verifiedAt: submissionVerifications.decidedAt,
			revoked: verificationRevocations.id,
		})
		.from(earnedBadges)
		.innerJoin(
			submissionVerifications,
			eq(submissionVerifications.id, earnedBadges.verificationId),
		)
		.innerJoin(users, eq(users.id, submissionVerifications.reviewerUserId))
		.innerJoin(enrollments, eq(enrollments.id, earnedBadges.enrollmentId))
		.innerJoin(learningCenters, eq(learningCenters.id, enrollments.centerId))
		.leftJoin(
			centerStaff,
			and(
				eq(centerStaff.userId, submissionVerifications.reviewerUserId),
				eq(centerStaff.centerId, enrollments.centerId),
			),
		)
		.leftJoin(
			verificationRevocations,
			eq(verificationRevocations.verificationId, submissionVerifications.id),
		)
		.where(eq(earnedBadges.userId, userId));
	const revoked = new Set(
		rows.filter((row) => row.entry === "revoked").map((row) => row.badgeId),
	);
	const map = new Map<string, Verifier>();
	for (const row of rows) {
		if (row.entry !== "awarded" || revoked.has(row.badgeId) || row.revoked) {
			continue;
		}
		const next: Verifier = {
			name: row.name?.trim() || "",
			role: authorityRole(row.role),
			centerName: row.centerName,
			verifiedAt: row.verifiedAt.toISOString(),
		};
		const current = map.get(row.badgeId);
		if (current?.role !== "trainer") map.set(row.badgeId, next);
	}
	return map;
}

async function verifiersForTasks(
	database: Pick<Database, "select">,
	userId: number,
): Promise<Map<string, Verifier>> {
	const rows = await database
		.select({
			taskId: taskSubmissions.taskId,
			name: users.name,
			role: centerStaff.role,
			centerName: learningCenters.name,
			verifiedAt: submissionVerifications.decidedAt,
		})
		.from(taskSubmissions)
		.innerJoin(
			submissionVerifications,
			eq(submissionVerifications.submissionId, taskSubmissions.id),
		)
		.innerJoin(users, eq(users.id, submissionVerifications.reviewerUserId))
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.innerJoin(learningCenters, eq(learningCenters.id, enrollments.centerId))
		.leftJoin(
			centerStaff,
			and(
				eq(centerStaff.userId, submissionVerifications.reviewerUserId),
				eq(centerStaff.centerId, enrollments.centerId),
			),
		)
		.leftJoin(
			verificationRevocations,
			eq(verificationRevocations.verificationId, submissionVerifications.id),
		)
		.where(
			and(
				eq(taskSubmissions.ownerUserId, userId),
				eq(taskSubmissions.status, "approved"),
				eq(submissionVerifications.decision, "approved"),
				isNull(verificationRevocations.id),
			),
		)
		.orderBy(desc(submissionVerifications.decidedAt));
	const map = new Map<string, Verifier>();
	for (const row of rows) {
		if (map.has(row.taskId)) continue;
		map.set(row.taskId, {
			name: row.name?.trim() || "",
			role: authorityRole(row.role),
			centerName: row.centerName,
			verifiedAt: row.verifiedAt.toISOString(),
		});
	}
	return map;
}

async function listEvidence(
	database: Pick<Database, "select">,
	userId: number,
): Promise<{ id: string; contentType: string; objectKey: string }[]> {
	const rows = await database
		.select({
			id: mediaObjects.id,
			contentType: mediaObjects.contentType,
			objectKey: mediaObjects.objectKey,
		})
		.from(taskSubmissions)
		.innerJoin(mediaObjects, eq(mediaObjects.id, taskSubmissions.mediaObjectId))
		.innerJoin(
			submissionVerifications,
			eq(submissionVerifications.submissionId, taskSubmissions.id),
		)
		.leftJoin(
			verificationRevocations,
			eq(verificationRevocations.verificationId, submissionVerifications.id),
		)
		.where(
			and(
				eq(taskSubmissions.ownerUserId, userId),
				eq(taskSubmissions.status, "approved"),
				eq(mediaObjects.ownerUserId, userId),
				eq(mediaObjects.status, "ready"),
				eq(submissionVerifications.decision, "approved"),
				isNull(verificationRevocations.id),
			),
		);
	return rows.filter((row) => isImage(row.contentType));
}

async function ownedIds(
	database: ShareDb,
	userId: number,
): Promise<{ badges: Set<string>; tasks: Set<string>; evidence: Set<string> }> {
	const passport = await readPassport(database, userId);
	const evidence = await listEvidence(database, userId);
	return {
		badges: new Set(passport.badges.map((badge) => badge.id.toLowerCase())),
		tasks: new Set(passport.tasks.map((task) => task.id.toLowerCase())),
		evidence: new Set(evidence.map((item) => item.id.toLowerCase())),
	};
}

async function publicEvidence(
	database: Pick<Database, "select">,
	userId: number,
	pinned: string[],
	signObject: ObjectSigner | undefined,
): Promise<PublicEvidence[]> {
	if (pinned.length === 0) return [];
	const rows = await listEvidence(database, userId);
	const wanted = new Set(pinned);
	const shown = rows.filter((row) => wanted.has(row.id.toLowerCase()));
	const evidence: PublicEvidence[] = [];
	for (const row of shown) {
		const url = signObject ? await signObject(row.objectKey) : null;
		evidence.push({ id: row.id, contentType: row.contentType, url });
	}
	return evidence;
}
