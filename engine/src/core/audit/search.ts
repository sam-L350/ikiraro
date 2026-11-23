import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	centerStaff,
	learningCenters,
	sectors,
	systemAuditLogs,
	userRoles,
	users,
} from "../../db/schema";
import { auditCsv } from "./csv";
import type { AuditScope } from "./scope";
import { writeAudit } from "./write";

const SEARCH_LIMIT = 40;
const EXPORT_LIMIT = 500;

export type AuditRow = {
	id: string;
	action: string;
	actorId: number | null;
	actorName: string | null;
	targetType: string | null;
	targetId: string | null;
	createdAt: string;
};

export type AuditFilter = {
	action?: string;
	targetType?: string;
};

type AuditDb = Pick<Database, "select">;

function cleanFilter(input: AuditFilter): {
	action: string;
	targetType: string;
} {
	return {
		action: (input.action ?? "").trim().slice(0, 80),
		targetType: (input.targetType ?? "").trim().slice(0, 40),
	};
}

async function peopleInCenters(
	database: AuditDb,
	centerIds: readonly string[],
): Promise<number[]> {
	if (centerIds.length === 0) return [];
	const ids = centerIds.slice();
	const [home, staff, assigned] = await Promise.all([
		database
			.select({ id: users.id })
			.from(users)
			.where(inArray(users.centerId, ids)),
		database
			.select({ id: centerStaff.userId })
			.from(centerStaff)
			.where(inArray(centerStaff.centerId, ids)),
		database
			.select({ id: userRoles.userId })
			.from(userRoles)
			.where(
				and(eq(userRoles.scopeType, "center"), inArray(userRoles.scopeId, ids)),
			),
	]);
	return [...home, ...staff, ...assigned].map((row) => row.id);
}

async function peopleInDistricts(
	database: AuditDb,
	districtIds: readonly string[],
): Promise<{ userIds: number[]; centerIds: string[] }> {
	if (districtIds.length === 0) return { userIds: [], centerIds: [] };
	const centers = await database
		.select({ id: learningCenters.id })
		.from(learningCenters)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(inArray(sectors.districtId, districtIds.slice()));
	const centerIds = centers.map((row) => row.id);
	const assigned = await database
		.select({ id: userRoles.userId })
		.from(userRoles)
		.where(
			and(
				eq(userRoles.scopeType, "district"),
				inArray(userRoles.scopeId, districtIds.slice()),
			),
		);
	const inCenters = await peopleInCenters(database, centerIds);
	return {
		userIds: [...assigned.map((row) => row.id), ...inCenters],
		centerIds,
	};
}

async function visibleUserIds(
	database: AuditDb,
	scope: AuditScope,
	viewerId: number,
): Promise<number[] | "all"> {
	if (scope.kind === "all") return "all";
	const district = await peopleInDistricts(database, scope.districtIds);
	const centerIds = [...new Set([...scope.centerIds, ...district.centerIds])];
	const fromCenters = await peopleInCenters(database, centerIds);
	return [...new Set([viewerId, ...district.userIds, ...fromCenters])];
}

export async function readAudit(
	database: AuditDb,
	input: {
		scope: AuditScope;
		viewerId: number;
		filter: AuditFilter;
		limit: number;
	},
): Promise<AuditRow[]> {
	const visible = await visibleUserIds(database, input.scope, input.viewerId);
	if (visible !== "all" && visible.length === 0) return [];
	const filter = cleanFilter(input.filter);
	const scopeClause =
		visible === "all"
			? undefined
			: and(
					sql`${systemAuditLogs.action} not like 'misconduct.%'`,
					or(
						inArray(systemAuditLogs.actorId, visible),
						and(
							eq(systemAuditLogs.targetType, "user"),
							inArray(systemAuditLogs.targetId, visible.map(String)),
						),
					),
				);
	const actionClause = filter.action
		? ilike(
				systemAuditLogs.action,
				`${filter.action.replace(/[\\%_]/g, (char) => `\\${char}`)}%`,
			)
		: undefined;
	const targetClause = filter.targetType
		? eq(systemAuditLogs.targetType, filter.targetType)
		: undefined;
	const where = and(scopeClause, actionClause, targetClause);
	const rows = await database
		.select({
			id: systemAuditLogs.id,
			action: systemAuditLogs.action,
			actorId: systemAuditLogs.actorId,
			actorName: users.name,
			targetType: systemAuditLogs.targetType,
			targetId: systemAuditLogs.targetId,
			createdAt: systemAuditLogs.createdAt,
		})
		.from(systemAuditLogs)
		.leftJoin(users, eq(users.id, systemAuditLogs.actorId))
		.where(where ?? sql`true`)
		.orderBy(desc(systemAuditLogs.createdAt))
		.limit(input.limit);
	return rows.map((row) => ({
		id: row.id,
		action: row.action,
		actorId: row.actorId,
		actorName: row.actorName,
		targetType: row.targetType,
		targetId: row.targetId,
		createdAt: row.createdAt.toISOString(),
	}));
}

export async function searchAuditLog(
	database: Pick<Database, "select">,
	input: { scope: AuditScope; viewerId: number; filter: AuditFilter },
): Promise<AuditRow[]> {
	return readAudit(database, { ...input, limit: SEARCH_LIMIT });
}

export async function exportAuditLog(
	database: Pick<Database, "select" | "insert">,
	input: {
		scope: AuditScope;
		viewerId: number;
		filter: AuditFilter;
		ip: string;
	},
): Promise<{ csv: string }> {
	const rows = await readAudit(database, {
		scope: input.scope,
		viewerId: input.viewerId,
		filter: input.filter,
		limit: EXPORT_LIMIT,
	});
	await writeAudit(database, {
		actorId: input.viewerId,
		action: "audit.exported",
		targetType: "audit",
		ipAddress: input.ip,
		metadata: {
			rows: rows.length,
			action: input.filter.action ?? "",
			targetType: input.filter.targetType ?? "",
		},
	});
	return { csv: auditCsv(rows) };
}
