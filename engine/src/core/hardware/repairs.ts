import { asc, desc, eq } from "drizzle-orm";
import type { Database } from "../../db";
import {
	hardwareInventory,
	itemRepairs,
	itemWarranties,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { ROLE_PERMISSIONS } from "../authz/catalog";
import type { Assignment } from "../authz/decide";

type CareDb = Pick<Database, "insert" | "select">;

export type RepairRow = {
	id: string;
	note: string;
	recordedAt: string;
};

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value,
	);
}

function requireOfficer(assignments: readonly Assignment[]): void {
	const allowed = assignments.some((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes("hardware.manage"),
	);
	if (!allowed) {
		throw errors.forbidden("A hardware officer records a repair.", {
			reason: "repair",
		});
	}
}

async function requireItem(
	database: CareDb,
	inventoryId: string,
): Promise<void> {
	if (!isUuid(inventoryId)) throw errors.notFound("That item was not found.");
	const [row] = await database
		.select({ id: hardwareInventory.id })
		.from(hardwareInventory)
		.where(eq(hardwareInventory.id, inventoryId))
		.limit(1);
	if (!row) throw errors.notFound("That item was not found.");
}

function requireDate(value: string): string {
	const endsOn = value.trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) {
		throw errors.badRequest("Write the warranty date.", { reason: "warranty" });
	}
	const [year, month, day] = endsOn.split("-").map(Number);
	if (
		year === undefined ||
		month === undefined ||
		day === undefined ||
		!Number.isInteger(year) ||
		!Number.isInteger(month) ||
		!Number.isInteger(day)
	) {
		throw errors.badRequest("Write the warranty date.", { reason: "warranty" });
	}
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		throw errors.badRequest("Write the warranty date.", { reason: "warranty" });
	}
	return endsOn;
}

/** Repairs and the latest warranty date on one item. */
export async function readItemCare(
	database: CareDb,
	assignments: readonly Assignment[],
	inventoryId: string,
): Promise<{ repairs: RepairRow[]; warrantyEndsOn: string | null }> {
	requireOfficer(assignments);
	await requireItem(database, inventoryId);
	const repairs = await database
		.select({
			id: itemRepairs.id,
			note: itemRepairs.note,
			recordedAt: itemRepairs.createdAt,
		})
		.from(itemRepairs)
		.where(eq(itemRepairs.inventoryId, inventoryId))
		.orderBy(asc(itemRepairs.createdAt));
	const [warranty] = await database
		.select({ endsOn: itemWarranties.endsOn })
		.from(itemWarranties)
		.where(eq(itemWarranties.inventoryId, inventoryId))
		.orderBy(desc(itemWarranties.createdAt))
		.limit(1);
	return {
		repairs: repairs.map((row) => ({
			id: row.id,
			note: row.note,
			recordedAt: row.recordedAt.toISOString(),
		})),
		warrantyEndsOn: warranty?.endsOn ?? null,
	};
}

/** Write what was repaired. The item's status stays as the officer left it. */
export async function recordRepair(
	database: CareDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		inventoryId: string;
		note: string;
		ip: string;
	},
): Promise<{ id: string }> {
	requireOfficer(input.assignments);
	const note = input.note.trim();
	if (note.length < 1 || note.length > 500) {
		throw errors.badRequest("Write what was repaired.", { reason: "repair" });
	}
	await requireItem(database, input.inventoryId);
	const [created] = await database
		.insert(itemRepairs)
		.values({
			inventoryId: input.inventoryId,
			note,
			recordedByUserId: input.actorId,
		})
		.returning({ id: itemRepairs.id });
	if (!created) throw errors.internal("The repair was not stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "item.repaired",
		targetType: "item_repair",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: { inventoryId: input.inventoryId },
	});
	return { id: created.id };
}

/** Write the warranty end date the officer typed. A blank is refused. */
export async function recordWarranty(
	database: CareDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		inventoryId: string;
		endsOn: string;
		ip: string;
	},
): Promise<{ id: string }> {
	requireOfficer(input.assignments);
	const endsOn = requireDate(input.endsOn);
	await requireItem(database, input.inventoryId);
	const [created] = await database
		.insert(itemWarranties)
		.values({
			inventoryId: input.inventoryId,
			endsOn,
			recordedByUserId: input.actorId,
		})
		.returning({ id: itemWarranties.id });
	if (!created) throw errors.internal("The warranty was not stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "item.warrantied",
		targetType: "item_warranty",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: { inventoryId: input.inventoryId },
	});
	return { id: created.id };
}
