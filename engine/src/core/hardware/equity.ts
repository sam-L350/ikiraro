import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	allocationRounds,
	consents,
	districts,
	earnedBadges,
	enrollments,
	hardwareGrants,
	hardwareInventory,
	learningCenters,
	pointTransactions,
	roles,
	roundApplications,
	sectors,
	sessionAttendance,
	submissionVerifications,
	taskSubmissions,
	userRoles,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { ROLE_PERMISSIONS } from "../authz/catalog";
import type { Assignment } from "../authz/decide";
import { ageBand, boardInitials, progressToward, visibleGroups } from "./board";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_AFTER_DAYS = 90;

type EquityDb = Database;

export type BoardRow = {
	initials: string;
	district: string;
	progress: number | null;
};

export type FunnelCounts = {
	registered: number;
	enrolled: number;
	submitted: number;
	approved: number;
	badges: number;
	applicants: number;
	recipients: number;
	activeAt90Days: number;
};

export type EquitySlice = {
	label: string;
	registered: number;
	enrolled: number;
	applicants: number;
	recipients: number;
};

export type DonorItem = {
	name: string;
	serial: string;
	centerName: string;
	districtName: string;
	status: string;
	outcome: string;
};

export type DonorBatch = {
	donor: string;
	items: DonorItem[];
};

export type EquityReport = {
	funnel: FunnelCounts;
	districts: EquitySlice[];
	ages: EquitySlice[];
	sectors: EquitySlice[];
	genders: EquitySlice[];
	batches: DonorBatch[];
};

type LearnerRow = {
	id: number;
	name: string | null;
	gender: string | null;
	dateOfBirth: string | null;
	economicSector: string | null;
	createdAt: Date;
	districtId: string | null;
	districtName: string | null;
};

function canRead(assignments: readonly Assignment[]): boolean {
	return assignments.some((assignment) => {
		const permissions = ROLE_PERMISSIONS[assignment.role];
		return (
			permissions.includes("report.read") ||
			permissions.includes("admin.manage") ||
			permissions.includes("district.manage") ||
			permissions.includes("center.manage") ||
			permissions.includes("hardware.manage")
		);
	});
}

function isGlobal(assignments: readonly Assignment[]): boolean {
	return assignments.some((assignment) => {
		if (assignment.scopeType !== "global") return false;
		const permissions = ROLE_PERMISSIONS[assignment.role];
		return (
			permissions.includes("report.read") ||
			permissions.includes("admin.manage") ||
			permissions.includes("hardware.manage")
		);
	});
}

async function districtIdsFor(
	database: EquityDb,
	assignments: readonly Assignment[],
): Promise<string[] | null> {
	if (!canRead(assignments)) return null;
	if (isGlobal(assignments)) return null;
	const ids = new Set<string>();
	const centerIds: string[] = [];
	for (const assignment of assignments) {
		if (!assignment.scopeId) continue;
		if (
			assignment.scopeType === "district" &&
			ROLE_PERMISSIONS[assignment.role].includes("district.manage")
		) {
			ids.add(assignment.scopeId);
		}
		if (
			assignment.scopeType === "center" &&
			ROLE_PERMISSIONS[assignment.role].includes("center.manage")
		) {
			centerIds.push(assignment.scopeId);
		}
	}
	if (centerIds.length > 0) {
		const rows = await database
			.select({ districtId: sectors.districtId })
			.from(learningCenters)
			.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
			.where(inArray(learningCenters.id, centerIds));
		for (const row of rows) ids.add(row.districtId);
	}
	return [...ids];
}

function inScope(learner: LearnerRow, districtIds: string[] | null): boolean {
	if (districtIds === null) return true;
	return (
		learner.districtId !== null && districtIds.includes(learner.districtId)
	);
}

async function learners(database: EquityDb): Promise<LearnerRow[]> {
	const rows = await database
		.select({
			id: users.id,
			name: users.name,
			gender: users.gender,
			dateOfBirth: users.dateOfBirth,
			economicSector: users.economicSector,
			createdAt: users.createdAt,
			districtId: districts.id,
			districtName: districts.name,
		})
		.from(users)
		.innerJoin(userRoles, eq(userRoles.userId, users.id))
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.leftJoin(learningCenters, eq(learningCenters.id, users.centerId))
		.leftJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.leftJoin(districts, eq(districts.id, sectors.districtId))
		.where(and(eq(roles.code, "learner"), isNull(users.deletedAt)));
	const seen = new Set<number>();
	const unique: LearnerRow[] = [];
	for (const row of rows) {
		if (seen.has(row.id)) continue;
		seen.add(row.id);
		unique.push(row);
	}
	return unique;
}

function idSet(rows: { id: number }[]): Set<number> {
	return new Set(rows.map((row) => row.id));
}

function countIn(ids: Set<number>, people: readonly LearnerRow[]): number {
	let total = 0;
	for (const person of people) {
		if (ids.has(person.id)) total += 1;
	}
	return total;
}

function slices(
	people: readonly LearnerRow[],
	labelOf: (person: LearnerRow) => string | null,
	enrolled: Set<number>,
	applicants: Set<number>,
	recipients: Set<number>,
): EquitySlice[] {
	const groups = new Map<string, LearnerRow[]>();
	for (const person of people) {
		const label = labelOf(person);
		if (!label) continue;
		const list = groups.get(label) ?? [];
		list.push(person);
		groups.set(label, list);
	}
	const rows: EquitySlice[] = [];
	for (const [label, members] of groups) {
		rows.push({
			label,
			registered: members.length,
			enrolled: countIn(enrolled, members),
			applicants: countIn(applicants, members),
			recipients: countIn(recipients, members),
		});
	}
	rows.sort((left, right) => left.label.localeCompare(right.label));
	return visibleGroups(rows);
}

async function genderConsent(
	database: EquityDb,
	people: readonly LearnerRow[],
): Promise<Set<number>> {
	if (people.length === 0) return new Set();
	const rows = await database
		.selectDistinctOn([consents.userId], {
			userId: consents.userId,
			granted: consents.granted,
		})
		.from(consents)
		.where(
			and(
				eq(consents.purpose, "data_use"),
				inArray(
					consents.userId,
					people.map((person) => person.id),
				),
			),
		)
		.orderBy(consents.userId, desc(consents.grantedAt));
	return new Set(rows.filter((row) => row.granted).map((row) => row.userId));
}

function outcome(
	status: string,
	grantStatus: string | null,
	handed: Date | null,
): string {
	if (grantStatus === "recovered") return "recovered";
	if (grantStatus === "transferred") return "transferred";
	if (grantStatus === "active" && handed) return "handed_over";
	if (grantStatus === "active") return "awarded";
	return status;
}

async function batches(
	database: EquityDb,
	districtIds: string[] | null,
): Promise<DonorBatch[]> {
	const rows = await database
		.select({
			donor: hardwareInventory.donor,
			name: hardwareInventory.name,
			serial: hardwareInventory.serial,
			status: hardwareInventory.status,
			centerName: learningCenters.name,
			districtId: districts.id,
			districtName: districts.name,
			grantStatus: hardwareGrants.status,
			handed: hardwareGrants.handoverConfirmedAt,
		})
		.from(hardwareInventory)
		.innerJoin(
			learningCenters,
			eq(learningCenters.id, hardwareInventory.centerId),
		)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.innerJoin(districts, eq(districts.id, sectors.districtId))
		.leftJoin(
			hardwareGrants,
			and(
				eq(hardwareGrants.inventoryId, hardwareInventory.id),
				sql`${hardwareGrants.status} in ('active', 'recovered', 'transferred')`,
			),
		)
		.where(sql`${hardwareInventory.donor} is not null`);
	const groups = new Map<string, DonorItem[]>();
	for (const row of rows) {
		if (!row.donor) continue;
		if (districtIds !== null && !districtIds.includes(row.districtId)) continue;
		const list = groups.get(row.donor) ?? [];
		list.push({
			name: row.name,
			serial: row.serial,
			centerName: row.centerName,
			districtName: row.districtName,
			status: row.status,
			outcome: outcome(row.status, row.grantStatus, row.handed),
		});
		groups.set(row.donor, list);
	}
	return [...groups.entries()]
		.sort((left, right) => left[0].localeCompare(right[0]))
		.map(([donor, items]) => ({ donor, items }));
}

async function assemble(
	database: EquityDb,
	districtIds: string[] | null,
): Promise<EquityReport> {
	const people = (await learners(database)).filter((person) =>
		inScope(person, districtIds),
	);
	const ids = people.map((person) => person.id);
	const empty = new Set<number>();
	const enrolled =
		ids.length === 0
			? empty
			: idSet(
					await database
						.selectDistinct({ id: enrollments.userId })
						.from(enrollments)
						.where(inArray(enrollments.userId, ids)),
				);
	const submitted =
		ids.length === 0
			? empty
			: idSet(
					await database
						.selectDistinct({ id: taskSubmissions.ownerUserId })
						.from(taskSubmissions)
						.where(inArray(taskSubmissions.ownerUserId, ids)),
				);
	const approved =
		ids.length === 0
			? empty
			: idSet(
					await database
						.selectDistinct({ id: taskSubmissions.ownerUserId })
						.from(submissionVerifications)
						.innerJoin(
							taskSubmissions,
							eq(taskSubmissions.id, submissionVerifications.submissionId),
						)
						.where(
							and(
								eq(submissionVerifications.decision, "approved"),
								inArray(taskSubmissions.ownerUserId, ids),
							),
						),
				);
	const badges =
		ids.length === 0
			? empty
			: idSet(
					await database
						.selectDistinct({ id: earnedBadges.userId })
						.from(earnedBadges)
						.where(
							and(
								eq(earnedBadges.entry, "awarded"),
								inArray(earnedBadges.userId, ids),
							),
						),
				);
	const applicants =
		ids.length === 0
			? empty
			: idSet(
					await database
						.selectDistinct({ id: roundApplications.userId })
						.from(roundApplications)
						.where(inArray(roundApplications.userId, ids)),
				);
	const recipients =
		ids.length === 0
			? empty
			: idSet(
					await database
						.selectDistinct({ id: hardwareGrants.recipientUserId })
						.from(hardwareGrants)
						.where(inArray(hardwareGrants.recipientUserId, ids)),
				);
	const cutoff = new Date(Date.now() - ACTIVE_AFTER_DAYS * DAY_MS);
	const recentSubmission =
		ids.length === 0
			? empty
			: idSet(
					await database
						.selectDistinct({ id: taskSubmissions.ownerUserId })
						.from(taskSubmissions)
						.where(
							and(
								inArray(taskSubmissions.ownerUserId, ids),
								gte(taskSubmissions.createdAt, cutoff),
							),
						),
				);
	const recentAttendance =
		ids.length === 0
			? empty
			: idSet(
					await database
						.selectDistinct({ id: sessionAttendance.learnerUserId })
						.from(sessionAttendance)
						.where(
							and(
								inArray(sessionAttendance.learnerUserId, ids),
								gte(sessionAttendance.markedAt, cutoff),
							),
						),
				);
	let activeAt90Days = 0;
	for (const person of people) {
		if (person.createdAt.getTime() > cutoff.getTime()) continue;
		if (recentSubmission.has(person.id) || recentAttendance.has(person.id)) {
			activeAt90Days += 1;
		}
	}
	const consented = await genderConsent(database, people);
	const gendered = people.filter(
		(person) => consented.has(person.id) && person.gender?.trim(),
	);
	return {
		funnel: {
			registered: people.length,
			enrolled: countIn(enrolled, people),
			submitted: countIn(submitted, people),
			approved: countIn(approved, people),
			badges: countIn(badges, people),
			applicants: countIn(applicants, people),
			recipients: countIn(recipients, people),
			activeAt90Days,
		},
		districts: slices(
			people,
			(person) => person.districtName,
			enrolled,
			applicants,
			recipients,
		),
		ages: slices(
			people,
			(person) => ageBand(person.dateOfBirth),
			enrolled,
			applicants,
			recipients,
		),
		sectors: slices(
			people,
			(person) => person.economicSector?.trim() || null,
			enrolled,
			applicants,
			recipients,
		),
		genders: slices(
			gendered,
			(person) => person.gender?.trim() || null,
			enrolled,
			applicants,
			recipients,
		),
		batches: await batches(database, districtIds),
	};
}

/** Alias or initials, district, and progress. Full names stay off. */
export async function listBoard(database: EquityDb): Promise<BoardRow[]> {
	const opted = await database
		.selectDistinctOn([consents.userId], {
			userId: consents.userId,
			granted: consents.granted,
		})
		.from(consents)
		.where(eq(consents.purpose, "leaderboard"))
		.orderBy(consents.userId, desc(consents.grantedAt));
	const allowed = new Set(
		opted.filter((row) => row.granted).map((row) => row.userId),
	);
	if (allowed.size === 0) return [];
	const people = (await learners(database)).filter((person) =>
		allowed.has(person.id),
	);
	const ids = people.map((person) => person.id);
	const totals =
		ids.length === 0
			? []
			: await database
					.select({
						userId: pointTransactions.userId,
						total: sql<string | number>`sum(${pointTransactions.amount})`,
					})
					.from(pointTransactions)
					.where(inArray(pointTransactions.userId, ids))
					.groupBy(pointTransactions.userId);
	const points = new Map<number, number>();
	for (const row of totals) points.set(row.userId, Number(row.total) || 0);
	const now = new Date();
	const rounds = await database
		.select({
			districtId: allocationRounds.districtId,
			criteria: allocationRounds.criteria,
		})
		.from(allocationRounds)
		.where(
			and(
				lte(allocationRounds.opensAt, now),
				gte(allocationRounds.closesAt, now),
			),
		);
	const byDistrict = new Map<string, number[]>();
	for (const round of rounds) {
		if (!Array.isArray(round.criteria)) continue;
		const minima: number[] = [];
		for (const item of round.criteria) {
			if (!item || typeof item !== "object") continue;
			const row = item as { kind?: unknown; minimum?: unknown };
			if (
				row.kind === "points" &&
				typeof row.minimum === "number" &&
				Number.isInteger(row.minimum) &&
				row.minimum > 0
			) {
				minima.push(row.minimum);
			}
		}
		if (minima.length !== 1) continue;
		const list = byDistrict.get(round.districtId) ?? [];
		const minimum = minima[0];
		if (minimum !== undefined) list.push(minimum);
		byDistrict.set(round.districtId, list);
	}
	const threshold = new Map<string, number | null>();
	for (const [districtId, minima] of byDistrict) {
		const unique = new Set(minima);
		threshold.set(
			districtId,
			unique.size === 1 ? ([...unique][0] ?? null) : null,
		);
	}
	const rows: BoardRow[] = [];
	for (const person of people) {
		const initials = boardInitials(person.name);
		if (!initials || !person.districtName || !person.districtId) continue;
		rows.push({
			initials,
			district: person.districtName,
			progress: progressToward(
				points.get(person.id) ?? 0,
				threshold.get(person.districtId) ?? null,
			),
		});
	}
	rows.sort((left, right) => {
		const district = left.district.localeCompare(right.district);
		if (district !== 0) return district;
		return left.initials.localeCompare(right.initials);
	});
	return rows.slice(0, 200);
}

/** Funnel, equity slices, and donor batches inside this person's scope. */
export async function readEquity(
	database: EquityDb,
	assignments: readonly Assignment[],
): Promise<EquityReport> {
	const districtIds = await districtIdsFor(database, assignments);
	if (districtIds === null && !canRead(assignments)) {
		throw errors.forbidden(
			"These counts are for a coordinator or an auditor.",
			{
				reason: "scope",
			},
		);
	}
	if (!canRead(assignments)) {
		throw errors.forbidden(
			"These counts are for a coordinator or an auditor.",
			{
				reason: "scope",
			},
		);
	}
	return assemble(database, isGlobal(assignments) ? null : districtIds);
}

function cell(value: string | number): string {
	const text = String(value);
	if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
	return text;
}

function sliceLines(title: string, rows: EquitySlice[]): string[] {
	const lines = [`${title},registered,enrolled,applicants,recipients`];
	for (const row of rows) {
		lines.push(
			[row.label, row.registered, row.enrolled, row.applicants, row.recipients]
				.map(cell)
				.join(","),
		);
	}
	return lines;
}

/** The same report as CSV. The download is audited. Names stay off the file. */
export async function exportEquity(
	database: EquityDb,
	input: { actorId: number; assignments: readonly Assignment[]; ip: string },
): Promise<{ csv: string }> {
	const report = await readEquity(database, input.assignments);
	const funnel = report.funnel;
	const lines = [
		"funnel,count",
		`registered,${funnel.registered}`,
		`enrolled,${funnel.enrolled}`,
		`submitted,${funnel.submitted}`,
		`approved,${funnel.approved}`,
		`badges,${funnel.badges}`,
		`applicants,${funnel.applicants}`,
		`recipients,${funnel.recipients}`,
		`active_at_90_days,${funnel.activeAt90Days}`,
		"",
		...sliceLines("district", report.districts),
		"",
		...sliceLines("age", report.ages),
		"",
		...sliceLines("sector", report.sectors),
		"",
		...sliceLines("gender", report.genders),
		"",
		"donor,item,serial,center,district,status,outcome",
	];
	for (const batch of report.batches) {
		for (const item of batch.items) {
			lines.push(
				[
					batch.donor,
					item.name,
					item.serial,
					item.centerName,
					item.districtName,
					item.status,
					item.outcome,
				]
					.map(cell)
					.join(","),
			);
		}
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "equity.exported",
		targetType: "equity_report",
		targetId: String(input.actorId),
		ipAddress: input.ip,
		metadata: { batches: report.batches.length },
	});
	return { csv: lines.join("\n") };
}
