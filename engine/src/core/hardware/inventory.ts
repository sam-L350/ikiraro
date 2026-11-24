import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "../../db";
import {
	hardwareInventory,
	hardwareStatusHistory,
	type JsonValue,
	learningCenters,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import {
	type EligibilityCriterion,
	type EligibilityOutcome,
	type EligibilityUser,
	evaluateEligibility,
} from "../learning/eligibility";

const NAME_LIMIT = 120;
const CATEGORY_LIMIT = 60;
const SERIAL_LIMIT = 80;
const DONOR_LIMIT = 120;
const NOTE_LIMIT = 200;
const RULE_LIMIT = 8;
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUSES = [
	"in_stock",
	"reserved",
	"awarded",
	"in_repair",
	"lost",
	"retired",
] as const;
const CONDITIONS = ["good", "worn", "damaged"] as const;

export type InventoryStatus = (typeof STATUSES)[number];
export type InventoryCondition = (typeof CONDITIONS)[number];

type InventoryDb = Pick<
	Database,
	"insert" | "select" | "transaction" | "update"
>;

export type InventoryItem = {
	id: string;
	name: string;
	category: string;
	serial: string;
	condition: InventoryCondition;
	status: InventoryStatus;
	centerId: string;
	centerName: string;
	donor: string | null;
	acquiredOn: string;
	criteria: EligibilityCriterion[];
};

export type InventoryHistory = {
	id: string;
	status: InventoryStatus;
	centerName: string;
	note: string | null;
	recordedAt: string;
};

export type InventoryDetail = InventoryItem & {
	history: InventoryHistory[];
	centers: { id: string; name: string }[];
};

/** The rules stored on one item. An empty list means this item adds no rule. */
export function parseItemCriteria(value: unknown): EligibilityCriterion[] {
	if (!Array.isArray(value)) {
		throw errors.badRequest("The rules on this item are not usable.", {
			reason: "criteria",
		});
	}
	if (value.length > RULE_LIMIT) {
		throw errors.badRequest("The rules on this item are not usable.", {
			reason: "criteria",
		});
	}
	return value.map(parseCriterion);
}

/** Run the item's own rules. Nothing here supplies a threshold the item did not store. */
export function evaluateItem(
	user: EligibilityUser,
	criteria: readonly EligibilityCriterion[],
): EligibilityOutcome[] {
	return evaluateEligibility(user, criteria);
}

function parseCriterion(value: unknown): EligibilityCriterion {
	if (typeof value !== "object" || value === null || !("kind" in value)) {
		throw errors.badRequest("The rules on this item are not usable.", {
			reason: "criteria",
		});
	}
	const kind = value.kind;
	switch (kind) {
		case "points":
		case "hours":
		case "attendance":
		case "months_active":
			return { kind, minimum: minimumOf(value) };
		case "badges":
			return parseBadges(value);
		case "district":
			return { kind: "district", districtId: districtOf(value) };
		default:
			throw errors.badRequest("The rules on this item are not usable.", {
				reason: "criteria",
			});
	}
}

function parseBadges(value: object): EligibilityCriterion {
	const minimum = "minimum" in value ? minimumOf(value) : undefined;
	const badgeId =
		"badgeId" in value && typeof value.badgeId === "string"
			? value.badgeId
			: undefined;
	if (badgeId !== undefined && !UUID_RE.test(badgeId)) {
		throw errors.badRequest("The rules on this item are not usable.", {
			reason: "criteria",
		});
	}
	if (minimum === undefined && badgeId === undefined) {
		throw errors.badRequest("The rules on this item are not usable.", {
			reason: "criteria",
		});
	}
	return { kind: "badges", minimum, badgeId };
}

function minimumOf(value: object): number {
	if (!("minimum" in value) || typeof value.minimum !== "number") {
		throw errors.badRequest("The rules on this item are not usable.", {
			reason: "criteria",
		});
	}
	if (!Number.isInteger(value.minimum) || value.minimum < 0) {
		throw errors.badRequest("The rules on this item are not usable.", {
			reason: "criteria",
		});
	}
	return value.minimum;
}

function districtOf(value: object): string {
	if (!("districtId" in value) || typeof value.districtId !== "string") {
		throw errors.badRequest("The rules on this item are not usable.", {
			reason: "criteria",
		});
	}
	if (!UUID_RE.test(value.districtId)) {
		throw errors.badRequest("The rules on this item are not usable.", {
			reason: "criteria",
		});
	}
	return value.districtId;
}

function isUuid(value: string): boolean {
	return UUID_RE.test(value);
}

function oneOf<T extends string>(
	value: string,
	allowed: readonly T[],
): T | null {
	for (const item of allowed) {
		if (item === value) return item;
	}
	return null;
}

function asStatus(value: string): InventoryStatus {
	const status = oneOf(value, STATUSES);
	if (!status) {
		throw errors.badRequest("Choose a status.", { reason: "status" });
	}
	return status;
}

function asCondition(value: string): InventoryCondition {
	const condition = oneOf(value, CONDITIONS);
	if (!condition) {
		throw errors.badRequest("Choose the condition.", { reason: "condition" });
	}
	return condition;
}

function clean(value: string, limit: number, reason: string): string {
	const text = value.trim();
	if (text.length < 1 || text.length > limit) {
		throw errors.badRequest("That value is not usable.", { reason });
	}
	return text;
}

function cleanDonor(value: string | undefined): string | null {
	if (value === undefined || value.trim() === "") return null;
	return clean(value, DONOR_LIMIT, "donor");
}

function cleanNote(value: string | undefined): string | null {
	if (value === undefined || value.trim() === "") return null;
	return clean(value, NOTE_LIMIT, "note");
}

function acquiredOn(value: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		throw errors.badRequest("Choose the date it was acquired.", {
			reason: "date",
		});
	}
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (
		Number.isNaN(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== value
	) {
		throw errors.badRequest("Choose the date it was acquired.", {
			reason: "date",
		});
	}
	return value;
}

function isUniqueViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if ("code" in error && error.code === "23505") return true;
	if ("cause" in error) return isUniqueViolation(error.cause);
	return false;
}

async function requireCenter(
	database: InventoryDb,
	centerId: string,
): Promise<{ id: string; name: string }> {
	if (!isUuid(centerId)) throw errors.notFound("That item was not found.");
	const [center] = await database
		.select({ id: learningCenters.id, name: learningCenters.name })
		.from(learningCenters)
		.where(
			and(eq(learningCenters.id, centerId), eq(learningCenters.active, true)),
		)
		.limit(1);
	if (!center) throw errors.notFound("That center was not found.");
	return center;
}

function toItem(
	row: typeof hardwareInventory.$inferSelect,
	centerName: string,
): InventoryItem {
	return {
		id: row.id,
		name: row.name,
		category: row.category,
		serial: row.serial,
		condition: asCondition(row.condition),
		status: asStatus(row.status),
		centerId: row.centerId,
		centerName,
		donor: row.donor,
		acquiredOn: row.acquiredOn,
		criteria: parseItemCriteria(row.criteria),
	};
}

/** Items in stock and the centers that can hold them. */
export async function listInventory(
	database: InventoryDb,
	input: { centerId?: string; status?: string },
): Promise<{
	items: InventoryItem[];
	centers: { id: string; name: string }[];
}> {
	if (input.centerId && !isUuid(input.centerId)) {
		throw errors.notFound("That item was not found.");
	}
	const status = input.status ? asStatus(input.status) : null;
	const rows = await database
		.select({
			item: hardwareInventory,
			centerName: learningCenters.name,
		})
		.from(hardwareInventory)
		.innerJoin(
			learningCenters,
			eq(learningCenters.id, hardwareInventory.centerId),
		)
		.where(
			and(
				input.centerId
					? eq(hardwareInventory.centerId, input.centerId)
					: undefined,
				status ? eq(hardwareInventory.status, status) : undefined,
			),
		)
		.orderBy(desc(hardwareInventory.createdAt))
		.limit(100);
	const centers = await database
		.select({ id: learningCenters.id, name: learningCenters.name })
		.from(learningCenters)
		.where(eq(learningCenters.active, true))
		.orderBy(asc(learningCenters.name))
		.limit(200);
	return {
		items: rows.map((row) => toItem(row.item, row.centerName)),
		centers,
	};
}

export async function readInventory(
	database: InventoryDb,
	itemId: string,
): Promise<InventoryDetail> {
	if (!isUuid(itemId)) throw errors.notFound("That item was not found.");
	const [row] = await database
		.select({
			item: hardwareInventory,
			centerName: learningCenters.name,
		})
		.from(hardwareInventory)
		.innerJoin(
			learningCenters,
			eq(learningCenters.id, hardwareInventory.centerId),
		)
		.where(eq(hardwareInventory.id, itemId))
		.limit(1);
	if (!row) throw errors.notFound("That item was not found.");
	const history = await database
		.select({
			id: hardwareStatusHistory.id,
			status: hardwareStatusHistory.status,
			centerName: learningCenters.name,
			note: hardwareStatusHistory.note,
			recordedAt: hardwareStatusHistory.recordedAt,
		})
		.from(hardwareStatusHistory)
		.innerJoin(
			learningCenters,
			eq(learningCenters.id, hardwareStatusHistory.centerId),
		)
		.where(eq(hardwareStatusHistory.inventoryId, itemId))
		.orderBy(desc(hardwareStatusHistory.recordedAt))
		.limit(50);
	const centers = await database
		.select({ id: learningCenters.id, name: learningCenters.name })
		.from(learningCenters)
		.where(eq(learningCenters.active, true))
		.orderBy(asc(learningCenters.name))
		.limit(200);
	return {
		...toItem(row.item, row.centerName),
		history: history.map((entry) => ({
			id: entry.id,
			status: asStatus(entry.status),
			centerName: entry.centerName,
			note: entry.note,
			recordedAt: entry.recordedAt.toISOString(),
		})),
		centers,
	};
}

/** Put an item on the register. The first history row is the same status. */
export async function createInventoryItem(
	database: InventoryDb,
	input: {
		actorId: number;
		name: string;
		category: string;
		serial: string;
		condition: string;
		centerId: string;
		donor?: string;
		acquiredOn: string;
		criteria: unknown;
		ip: string;
	},
): Promise<{ id: string }> {
	const center = await requireCenter(database, input.centerId);
	const name = clean(input.name, NAME_LIMIT, "name");
	const category = clean(input.category, CATEGORY_LIMIT, "category");
	const serial = clean(input.serial, SERIAL_LIMIT, "serial");
	const condition = asCondition(input.condition);
	const donor = cleanDonor(input.donor);
	const acquired = acquiredOn(input.acquiredOn);
	const criteria = parseItemCriteria(input.criteria);
	try {
		return await database.transaction(async (tx) => {
			const [row] = await tx
				.insert(hardwareInventory)
				.values({
					name,
					category,
					serial,
					condition,
					status: "in_stock",
					centerId: center.id,
					donor,
					acquiredOn: acquired,
					criteria: criteria as JsonValue,
					createdByUserId: input.actorId,
				})
				.returning({ id: hardwareInventory.id });
			if (!row) throw errors.internal("The item was not stored.");
			await tx.insert(hardwareStatusHistory).values({
				inventoryId: row.id,
				status: "in_stock",
				centerId: center.id,
				recordedByUserId: input.actorId,
			});
			await writeAudit(tx, {
				actorId: input.actorId,
				action: "inventory.created",
				targetType: "hardware_inventory",
				targetId: row.id,
				ipAddress: input.ip,
				metadata: { centerId: center.id },
			});
			return { id: row.id };
		});
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		throw errors.conflict("That serial is already on the register.", {
			reason: "serial",
		});
	}
}

/** Change the current row. A new status or center adds a history row and leaves the old ones. */
export async function updateInventoryItem(
	database: InventoryDb,
	input: {
		actorId: number;
		itemId: string;
		condition: string;
		status: string;
		centerId: string;
		donor?: string;
		note?: string;
		criteria: unknown;
		ip: string;
	},
): Promise<InventoryDetail> {
	if (!isUuid(input.itemId)) throw errors.notFound("That item was not found.");
	const center = await requireCenter(database, input.centerId);
	const condition = asCondition(input.condition);
	const status = asStatus(input.status);
	const donor = cleanDonor(input.donor);
	const note = cleanNote(input.note);
	const criteria = parseItemCriteria(input.criteria);
	const [current] = await database
		.select()
		.from(hardwareInventory)
		.where(eq(hardwareInventory.id, input.itemId))
		.limit(1);
	if (!current) throw errors.notFound("That item was not found.");
	const moved = current.status !== status || current.centerId !== center.id;
	await database.transaction(async (tx) => {
		await tx
			.update(hardwareInventory)
			.set({
				condition,
				status,
				centerId: center.id,
				donor,
				criteria: criteria as JsonValue,
			})
			.where(eq(hardwareInventory.id, current.id));
		if (moved) {
			await tx.insert(hardwareStatusHistory).values({
				inventoryId: current.id,
				status,
				centerId: center.id,
				note,
				recordedByUserId: input.actorId,
			});
		}
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "inventory.updated",
			targetType: "hardware_inventory",
			targetId: current.id,
			ipAddress: input.ip,
			metadata: { status },
		});
	});
	return readInventory(database, current.id);
}
