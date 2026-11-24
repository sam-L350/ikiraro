import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../../db";
import {
	districts,
	learningCenters,
	roles,
	sectors,
	userRoles,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { ROLE_PERMISSIONS } from "../authz/catalog";
import type { Assignment } from "../authz/decide";

type CoverageDb = Pick<Database, "select">;

export type CoverageRow = {
	sector: string;
	learners: number;
	homeCenter: string | null;
};

function canRead(assignments: readonly Assignment[]): boolean {
	return assignments.some((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes("district.manage"),
	);
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value,
	);
}

function samePlace(left: string, right: string): boolean {
	return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Sectors with no active center. Each row is that sector, how many learners
 * name it, and the home center those learners already use.
 */
export async function readCoverage(
	database: CoverageDb,
	assignments: readonly Assignment[],
): Promise<{ sectors: CoverageRow[] }> {
	if (!canRead(assignments)) {
		throw errors.forbidden("A district coordinator reads coverage.", {
			reason: "coverage",
		});
	}
	const global = assignments.some(
		(assignment) =>
			ROLE_PERMISSIONS[assignment.role].includes("district.manage") &&
			assignment.scopeType === "global",
	);
	const districtIds = assignments.flatMap((assignment) => {
		if (
			!ROLE_PERMISSIONS[assignment.role].includes("district.manage") ||
			assignment.scopeType !== "district" ||
			!assignment.scopeId ||
			!isUuid(assignment.scopeId)
		) {
			return [];
		}
		return [assignment.scopeId];
	});
	if (!global && districtIds.length === 0) return { sectors: [] };
	const places = await database
		.select({
			id: sectors.id,
			name: sectors.name,
			districtId: sectors.districtId,
			centerId: learningCenters.id,
		})
		.from(sectors)
		.innerJoin(districts, eq(districts.id, sectors.districtId))
		.leftJoin(
			learningCenters,
			and(
				eq(learningCenters.sectorId, sectors.id),
				eq(learningCenters.active, true),
			),
		)
		.where(global ? undefined : inArray(sectors.districtId, districtIds))
		.orderBy(asc(sectors.name));
	const open = new Map<string, string>();
	const covered = new Set<string>();
	for (const place of places) {
		if (place.centerId) covered.add(place.id);
		else if (!covered.has(place.id)) open.set(place.id, place.name);
	}
	for (const id of covered) open.delete(id);
	if (open.size === 0) return { sectors: [] };
	const people = await database
		.select({
			sector: users.sector,
			centerId: users.centerId,
			centerName: learningCenters.name,
		})
		.from(users)
		.innerJoin(userRoles, eq(userRoles.userId, users.id))
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.leftJoin(learningCenters, eq(learningCenters.id, users.centerId))
		.where(
			and(
				eq(roles.code, "learner"),
				isNull(userRoles.suspendedAt),
				isNull(users.deletedAt),
			),
		);
	const rows: CoverageRow[] = [];
	for (const name of open.values()) {
		const groups = new Map<string, { name: string | null; count: number }>();
		for (const person of people) {
			if (!person.sector || !samePlace(person.sector, name)) continue;
			const key = person.centerId ?? "";
			const group = groups.get(key) ?? { name: person.centerName, count: 0 };
			group.count += 1;
			groups.set(key, group);
		}
		if (groups.size === 0) {
			rows.push({ sector: name, learners: 0, homeCenter: null });
			continue;
		}
		for (const group of groups.values()) {
			rows.push({
				sector: name,
				learners: group.count,
				homeCenter: group.name,
			});
		}
	}
	rows.sort((left, right) => {
		const bySector = left.sector.localeCompare(right.sector);
		if (bySector !== 0) return bySector;
		return (left.homeCenter ?? "").localeCompare(right.homeCenter ?? "");
	});
	return { sectors: rows };
}
