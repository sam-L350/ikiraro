import { and, desc, eq, inArray, ne, notInArray } from "drizzle-orm";
import type { Database } from "../../db";
import {
	centerStaff,
	learningCenters,
	misconductReports,
	sectors,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { assignedCenterIds } from "../geography/centers";
import { readAssignments } from "../identity/staff";
import {
	type MisconductCase,
	type MisconductViewer,
	misconductAccess,
} from "./access";

const KINDS = ["misconduct", "bribery", "favoritism"] as const;
const BODY_LIMIT = 2_000;
const NOTE_LIMIT = 500;

export type MisconductKind = (typeof KINDS)[number];
export type MisconductStatus = "open" | "closed";

export type OwnConcern = {
	id: string;
	kind: MisconductKind;
	centerName: string;
	body: string;
	status: MisconductStatus;
	createdAt: string;
	closedNote: string | null;
};

export type ConcernSummary = {
	id: string;
	kind: MisconductKind;
	centerName: string;
	reporterName: string | null;
	createdAt: string;
};

export type ConcernDetail = OwnConcern & {
	reporterName: string | null;
	canClose: boolean;
};

type ReportDb = Pick<Database, "insert" | "select" | "transaction" | "update">;

export function isMisconductKind(value: string): value is MisconductKind {
	return (KINDS as readonly string[]).includes(value);
}

function asKind(value: string): MisconductKind {
	if (!isMisconductKind(value)) {
		throw errors.badRequest("Choose what happened.", { reason: "kind" });
	}
	return value;
}

function asStatus(value: string): MisconductStatus {
	switch (value) {
		case "open":
		case "closed":
			return value;
		default:
			throw errors.badRequest("That concern cannot be read.", {
				reason: "status",
			});
	}
}

function cleanBody(value: string): string {
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > BODY_LIMIT) {
		throw errors.badRequest("Write what you saw, in a few sentences.", {
			reason: "body",
		});
	}
	return trimmed;
}

function cleanNote(value: string): string {
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > NOTE_LIMIT) {
		throw errors.badRequest("Write what you decided.", { reason: "note" });
	}
	return trimmed;
}

export async function loadMisconductViewer(
	database: Pick<Database, "select">,
	userId: number,
): Promise<MisconductViewer> {
	const [person] = await database
		.select({ centerId: users.centerId })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	const centers = new Set(await assignedCenterIds(database, userId));
	if (person?.centerId) centers.add(person.centerId);
	const assignments = await readAssignments(database, userId);
	const districtIds: string[] = [];
	let admin = false;
	for (const assignment of assignments) {
		if (
			assignment.role === "platform_admin" &&
			assignment.scopeType === "global"
		) {
			admin = true;
		}
		if (
			assignment.role === "district_coordinator" &&
			assignment.scopeType === "district" &&
			assignment.scopeId
		) {
			districtIds.push(assignment.scopeId);
		}
	}
	return { userId, centerIds: [...centers], admin, districtIds };
}

async function centersForReporters(
	database: Pick<Database, "select">,
	userIds: readonly number[],
	stored: ReadonlyMap<number, string>,
): Promise<Map<number, string[]>> {
	const map = new Map<number, Set<string>>();
	for (const userId of userIds) map.set(userId, new Set());
	if (userIds.length === 0) return new Map();
	const ids = userIds.slice();
	const [homes, staff] = await Promise.all([
		database
			.select({ id: users.id, centerId: users.centerId })
			.from(users)
			.where(inArray(users.id, ids)),
		database
			.select({
				userId: centerStaff.userId,
				centerId: centerStaff.centerId,
			})
			.from(centerStaff)
			.where(inArray(centerStaff.userId, ids)),
	]);
	for (const home of homes) {
		if (home.centerId) map.get(home.id)?.add(home.centerId);
	}
	for (const row of staff) map.get(row.userId)?.add(row.centerId);
	for (const [userId, centerId] of stored) map.get(userId)?.add(centerId);
	return new Map(
		[...map.entries()].map(([userId, centerIds]) => [userId, [...centerIds]]),
	);
}

export async function listOwnConcerns(
	database: Pick<Database, "select">,
	userId: number,
): Promise<OwnConcern[]> {
	const rows = await database
		.select({
			id: misconductReports.id,
			kind: misconductReports.kind,
			centerName: learningCenters.name,
			body: misconductReports.body,
			status: misconductReports.status,
			createdAt: misconductReports.createdAt,
			closedNote: misconductReports.closedNote,
		})
		.from(misconductReports)
		.innerJoin(
			learningCenters,
			eq(learningCenters.id, misconductReports.accusedCenterId),
		)
		.where(eq(misconductReports.reporterUserId, userId))
		.orderBy(desc(misconductReports.createdAt))
		.limit(40);
	return rows.map((row) => ({
		id: row.id,
		kind: asKind(row.kind),
		centerName: row.centerName,
		body: row.body,
		status: asStatus(row.status),
		createdAt: row.createdAt.toISOString(),
		closedNote: row.closedNote,
	}));
}

export async function listConcernQueue(
	database: Pick<Database, "select">,
	viewer: MisconductViewer,
): Promise<ConcernSummary[]> {
	if (!viewer.admin && viewer.districtIds.length === 0) return [];
	const blocked =
		viewer.centerIds.length > 0 ? viewer.centerIds.slice() : undefined;
	const rows = await database
		.select({
			id: misconductReports.id,
			kind: misconductReports.kind,
			centerName: learningCenters.name,
			reporterUserId: misconductReports.reporterUserId,
			reporterName: users.name,
			reporterCenterId: misconductReports.reporterCenterId,
			accusedCenterId: misconductReports.accusedCenterId,
			accusedDistrictId: sectors.districtId,
			createdAt: misconductReports.createdAt,
		})
		.from(misconductReports)
		.innerJoin(
			learningCenters,
			eq(learningCenters.id, misconductReports.accusedCenterId),
		)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.innerJoin(users, eq(users.id, misconductReports.reporterUserId))
		.where(
			and(
				eq(misconductReports.status, "open"),
				ne(misconductReports.reporterUserId, viewer.userId),
				viewer.admin
					? undefined
					: inArray(sectors.districtId, viewer.districtIds.slice()),
				blocked
					? notInArray(misconductReports.accusedCenterId, blocked)
					: undefined,
			),
		)
		.orderBy(desc(misconductReports.createdAt))
		.limit(100);
	const stored = new Map(
		rows.map((row) => [row.reporterUserId, row.reporterCenterId]),
	);
	const centers = await centersForReporters(
		database,
		rows.map((row) => row.reporterUserId),
		stored,
	);
	return rows.flatMap((row) => {
		const access = misconductAccess(viewer, {
			reporterUserId: row.reporterUserId,
			reporterCenterIds: centers.get(row.reporterUserId) ?? [
				row.reporterCenterId,
			],
			accusedCenterId: row.accusedCenterId,
			accusedDistrictId: row.accusedDistrictId,
		});
		if (access !== "review") return [];
		return [
			{
				id: row.id,
				kind: asKind(row.kind),
				centerName: row.centerName,
				reporterName: row.reporterName,
				createdAt: row.createdAt.toISOString(),
			},
		];
	});
}

async function loadCase(
	database: Pick<Database, "select">,
	reportId: string,
): Promise<
	| (MisconductCase & {
			id: string;
			kind: string;
			body: string;
			status: string;
			centerName: string;
			reporterName: string | null;
			createdAt: Date;
			closedNote: string | null;
	  })
	| null
> {
	const [row] = await database
		.select({
			id: misconductReports.id,
			reporterUserId: misconductReports.reporterUserId,
			reporterCenterId: misconductReports.reporterCenterId,
			accusedCenterId: misconductReports.accusedCenterId,
			accusedDistrictId: sectors.districtId,
			kind: misconductReports.kind,
			body: misconductReports.body,
			status: misconductReports.status,
			centerName: learningCenters.name,
			reporterName: users.name,
			createdAt: misconductReports.createdAt,
			closedNote: misconductReports.closedNote,
		})
		.from(misconductReports)
		.innerJoin(
			learningCenters,
			eq(learningCenters.id, misconductReports.accusedCenterId),
		)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.innerJoin(users, eq(users.id, misconductReports.reporterUserId))
		.where(eq(misconductReports.id, reportId))
		.limit(1);
	if (!row) return null;
	const centers = await centersForReporters(
		database,
		[row.reporterUserId],
		new Map([[row.reporterUserId, row.reporterCenterId]]),
	);
	return {
		...row,
		reporterCenterIds: centers.get(row.reporterUserId) ?? [
			row.reporterCenterId,
		],
	};
}

export async function readConcern(
	database: Pick<Database, "select">,
	input: { reportId: string; viewer: MisconductViewer },
): Promise<ConcernDetail> {
	const row = await loadCase(database, input.reportId);
	if (!row) throw errors.notFound("That concern is not yours to read.");
	const access = misconductAccess(input.viewer, row);
	if (access === "none") {
		throw errors.notFound("That concern is not yours to read.");
	}
	return {
		id: row.id,
		kind: asKind(row.kind),
		centerName: row.centerName,
		body: row.body,
		status: asStatus(row.status),
		createdAt: row.createdAt.toISOString(),
		closedNote: row.closedNote,
		reporterName: access === "review" ? row.reporterName : null,
		canClose: access === "review" && row.status === "open",
	};
}

export async function fileConcern(
	database: ReportDb,
	input: {
		reporterId: number;
		centerId: string;
		kind: string;
		body: string;
		ip: string;
	},
): Promise<{ id: string }> {
	const kind = asKind(input.kind);
	const body = cleanBody(input.body);
	const viewer = await loadMisconductViewer(database, input.reporterId);
	if (!viewer.centerIds.includes(input.centerId)) {
		throw errors.notFound("That center was not found.");
	}
	return database.transaction(async (tx) => {
		const [row] = await tx
			.insert(misconductReports)
			.values({
				reporterUserId: input.reporterId,
				reporterCenterId: input.centerId,
				accusedCenterId: input.centerId,
				kind,
				body,
			})
			.returning({ id: misconductReports.id });
		if (!row) throw new Error("The concern was not stored.");
		await writeAudit(tx, {
			actorId: input.reporterId,
			action: "misconduct.filed",
			targetType: "misconduct_report",
			targetId: row.id,
			ipAddress: input.ip,
		});
		return { id: row.id };
	});
}

export async function closeConcern(
	database: ReportDb,
	input: {
		reportId: string;
		viewer: MisconductViewer;
		note: string;
		ip: string;
	},
): Promise<{ id: string; status: "closed" }> {
	const note = cleanNote(input.note);
	const row = await loadCase(database, input.reportId);
	if (!row || misconductAccess(input.viewer, row) !== "review") {
		throw errors.notFound("That concern is not yours to read.");
	}
	if (row.status !== "open") {
		throw errors.conflict("This concern is already closed.", {
			reason: "closed",
		});
	}
	await database.transaction(async (tx) => {
		await tx
			.update(misconductReports)
			.set({
				status: "closed",
				closedNote: note,
				closedByUserId: input.viewer.userId,
				closedAt: new Date(),
			})
			.where(eq(misconductReports.id, input.reportId));
		await writeAudit(tx, {
			actorId: input.viewer.userId,
			action: "misconduct.closed",
			targetType: "misconduct_report",
			targetId: input.reportId,
			ipAddress: input.ip,
		});
	});
	return { id: input.reportId, status: "closed" };
}
