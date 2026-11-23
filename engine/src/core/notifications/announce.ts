import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../../db";
import { districts, roles, userRoles } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit, writeEvent } from "../audit/write";
import { isRoleCode } from "../authz/catalog";
import { type Assignment, decideAccess, type ScopeType } from "../authz/decide";
import {
	centerExists,
	centerStaffByRole,
	expandCenterAssignments,
	listChoosableCenters,
} from "../geography/centers";

type AnnounceDb = Pick<Database, "insert" | "select" | "transaction">;

export type AnnouncementScope = "center" | "district";

export type AnnouncementTarget = { id: string; name: string };

function isScopeType(value: string): value is ScopeType {
	return (
		value === "self" ||
		value === "center" ||
		value === "district" ||
		value === "global"
	);
}

function clean(value: string, limit: number, reason: "title" | "body"): string {
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > limit) {
		throw errors.badRequest(
			reason === "title" ? "Write a short title." : "Write the announcement.",
			{ reason },
		);
	}
	return trimmed;
}

async function assignmentsFor(
	database: Pick<Database, "select">,
	userId: number,
): Promise<Assignment[]> {
	const rows = await database
		.select({
			code: roles.code,
			scopeType: userRoles.scopeType,
			scopeId: userRoles.scopeId,
		})
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(and(eq(userRoles.userId, userId), isNull(userRoles.suspendedAt)));
	const stored = rows.flatMap((row) => {
		if (!isRoleCode(row.code) || !isScopeType(row.scopeType)) return [];
		return [
			{
				role: row.code,
				scopeType: row.scopeType,
				scopeId: row.scopeId,
			},
		];
	});
	return expandCenterAssignments(
		stored,
		await centerStaffByRole(database, userId),
	);
}

function isAdmin(actorId: number, assignments: readonly Assignment[]): boolean {
	return decideAccess({
		actorId: String(actorId),
		assignments,
		permission: "admin.manage",
		resource: {},
	}).ok;
}

function canPost(
	actorId: number,
	assignments: readonly Assignment[],
	scope: AnnouncementScope,
	scopeId: string,
): boolean {
	if (isAdmin(actorId, assignments)) return true;
	const permission = scope === "center" ? "center.manage" : "district.manage";
	const resource =
		scope === "center" ? { centerId: scopeId } : { districtId: scopeId };
	return decideAccess({
		actorId: String(actorId),
		assignments,
		permission,
		resource,
	}).ok;
}

async function districtExists(
	database: Pick<Database, "select">,
	districtId: string,
): Promise<boolean> {
	const [row] = await database
		.select({ id: districts.id })
		.from(districts)
		.where(eq(districts.id, districtId))
		.limit(1);
	return Boolean(row);
}

/** Centers and districts this person may address. */
export async function listAnnouncementTargets(
	database: Pick<Database, "select">,
	userId: number,
): Promise<{
	allowed: boolean;
	centers: AnnouncementTarget[];
	districts: AnnouncementTarget[];
}> {
	const assignments = await assignmentsFor(database, userId);
	const admin = isAdmin(userId, assignments);
	const centerIds = assignments.flatMap((assignment) =>
		assignment.role === "center_manager" && assignment.scopeId
			? [assignment.scopeId]
			: [],
	);
	const districtIds = assignments.flatMap((assignment) =>
		assignment.role === "district_coordinator" &&
		assignment.scopeType === "district" &&
		assignment.scopeId
			? [assignment.scopeId]
			: [],
	);
	if (!admin && centerIds.length === 0 && districtIds.length === 0) {
		return { allowed: false, centers: [], districts: [] };
	}
	const centers = await listChoosableCenters(database, userId, null, admin);
	const visibleCenters = admin
		? centers
		: centers.filter((center) => centerIds.includes(center.id));
	const districtRows = admin
		? await database
				.select({ id: districts.id, name: districts.name })
				.from(districts)
				.orderBy(asc(districts.name))
		: districtIds.length === 0
			? []
			: await database
					.select({ id: districts.id, name: districts.name })
					.from(districts)
					.where(inArray(districts.id, districtIds))
					.orderBy(asc(districts.name));
	return {
		allowed: true,
		centers: visibleCenters.map((center) => ({
			id: center.id,
			name: center.name,
		})),
		districts: districtRows,
	};
}

/** Record an announcement. The drainer writes each person's inbox row. */
export async function createAnnouncement(
	database: AnnounceDb,
	input: {
		actorId: number;
		scope: AnnouncementScope;
		scopeId: string;
		title: string;
		body: string;
		ip: string;
	},
): Promise<{ id: string }> {
	const title = clean(input.title, 120, "title");
	const body = clean(input.body, 500, "body");
	const assignments = await assignmentsFor(database, input.actorId);
	if (!canPost(input.actorId, assignments, input.scope, input.scopeId)) {
		throw errors.forbidden("This announcement is outside your scope.", {
			reason: "scope",
		});
	}
	const exists =
		input.scope === "center"
			? await centerExists(database, input.scopeId)
			: await districtExists(database, input.scopeId);
	if (!exists) throw errors.notFound("That place was not found.");
	const id = await database.transaction(async (tx) => {
		const eventId = await writeEvent(tx, {
			name: "announcement.posted",
			payload: {
				scope: input.scope,
				scopeId: input.scopeId,
				title,
				message: body,
				actorId: input.actorId,
			},
		});
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "announcement.posted",
			targetType: "domain_event",
			targetId: eventId,
			ipAddress: input.ip,
			metadata: { scope: input.scope, scopeId: input.scopeId },
		});
		return eventId;
	});
	return { id };
}
