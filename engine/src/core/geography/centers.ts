import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db";
import {
	centerStaff,
	districts,
	learningCenters,
	provinces,
	sectors,
} from "../../db/schema";
import { errors } from "../api/error";
import type { Assignment } from "../authz/decide";

type CenterDb = Pick<Database, "select">;

export type CenterStaffRole = "trainer" | "center_manager";

export type CenterSummary = {
	id: string;
	name: string;
	active: boolean;
	sector: string;
	district: string;
	province: string;
	latitude: number | null;
	longitude: number | null;
};

const centerColumns = {
	id: learningCenters.id,
	name: learningCenters.name,
	active: learningCenters.active,
	sector: sectors.name,
	district: districts.name,
	province: provinces.name,
	latitude: learningCenters.latitude,
	longitude: learningCenters.longitude,
};

function centerQuery(database: CenterDb) {
	return database
		.select(centerColumns)
		.from(learningCenters)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.innerJoin(districts, eq(districts.id, sectors.districtId))
		.innerJoin(provinces, eq(provinces.id, districts.provinceId));
}

export function isCenterStaffRole(role: string): role is CenterStaffRole {
	switch (role) {
		case "trainer":
		case "center_manager":
			return true;
		default:
			return false;
	}
}

/** Replace a center-scoped role's single scope id with the centers that person actually works at. */
export function expandCenterAssignments(
	assignments: readonly Assignment[],
	centersByRole: Readonly<Record<CenterStaffRole, readonly string[]>>,
): Assignment[] {
	return assignments.flatMap((assignment) => {
		if (
			assignment.scopeType !== "center" ||
			!isCenterStaffRole(assignment.role)
		) {
			return [assignment];
		}
		const ids = centersByRole[assignment.role];
		if (ids.length === 0) return [{ ...assignment, scopeId: null }];
		return ids.map((scopeId) => ({ ...assignment, scopeId }));
	});
}

export async function centerStaffByRole(
	database: CenterDb,
	userId: number,
): Promise<Record<CenterStaffRole, string[]>> {
	const rows = await database
		.select({ centerId: centerStaff.centerId, role: centerStaff.role })
		.from(centerStaff)
		.where(eq(centerStaff.userId, userId));
	const grouped: Record<CenterStaffRole, string[]> = {
		trainer: [],
		center_manager: [],
	};
	for (const row of rows) {
		if (!isCenterStaffRole(row.role)) continue;
		grouped[row.role].push(row.centerId);
	}
	return grouped;
}

export async function assignedCenterIds(
	database: CenterDb,
	userId: number,
	role?: CenterStaffRole,
): Promise<string[]> {
	const grouped = await centerStaffByRole(database, userId);
	if (!role) return [...grouped.trainer, ...grouped.center_manager];
	return grouped[role];
}

async function centersByIds(
	database: CenterDb,
	ids: readonly string[],
): Promise<CenterSummary[]> {
	if (ids.length === 0) return [];
	return centerQuery(database)
		.where(inArray(learningCenters.id, [...ids]))
		.orderBy(asc(learningCenters.name));
}

/** Centers this person works at, plus a learner's home center. */
export async function listAssignedCenters(
	database: CenterDb,
	userId: number,
	homeCenterId: string | null,
): Promise<CenterSummary[]> {
	const ids = new Set(await assignedCenterIds(database, userId));
	if (homeCenterId) ids.add(homeCenterId);
	return centersByIds(database, [...ids]);
}

/** Centers a person may pick. An admin sees every active center. */
export async function listChoosableCenters(
	database: CenterDb,
	userId: number,
	homeCenterId: string | null,
	isAdmin: boolean,
): Promise<CenterSummary[]> {
	if (isAdmin) {
		return centerQuery(database)
			.where(eq(learningCenters.active, true))
			.orderBy(asc(learningCenters.name));
	}
	return listAssignedCenters(database, userId, homeCenterId);
}

/** A center outside this person's assignments is hidden. */
export async function readAssignedCenter(
	database: CenterDb,
	userId: number,
	homeCenterId: string | null,
	centerId: string,
): Promise<CenterSummary> {
	const visible = await listAssignedCenters(database, userId, homeCenterId);
	const match = visible.find((center) => center.id === centerId);
	if (!match) throw errors.notFound("That center was not found.");
	return match;
}

export async function centerExists(
	database: CenterDb,
	centerId: string,
): Promise<boolean> {
	const [row] = await database
		.select({ id: learningCenters.id })
		.from(learningCenters)
		.where(
			and(eq(learningCenters.id, centerId), eq(learningCenters.active, true)),
		)
		.limit(1);
	return Boolean(row);
}
