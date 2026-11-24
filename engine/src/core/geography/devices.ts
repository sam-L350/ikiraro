import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db";
import {
	deviceBookings,
	devices,
	enrollments,
	learningCenters,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { type ReviewCenter, reviewCenters } from "../learning/review-queue";
import { centerStaffByRole } from "./centers";

const LABEL_LIMIT = 80;
const MIN_MINUTES = 30;
const MAX_MINUTES = 180;
const BOOK_AHEAD_MS = 14 * 24 * 60 * 60 * 1000;
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DEVICE_KINDS = ["computer", "tablet", "router"] as const;
const DEVICE_CONDITIONS = ["good", "worn", "broken"] as const;
const DEVICE_AVAILABILITY = ["available", "in_use", "unavailable"] as const;

export type DeviceKind = (typeof DEVICE_KINDS)[number];
export type DeviceCondition = (typeof DEVICE_CONDITIONS)[number];
export type DeviceAvailability = (typeof DEVICE_AVAILABILITY)[number];

type DeviceDb = Pick<Database, "insert" | "select" | "transaction" | "update">;

export type CenterDevice = {
	id: string;
	centerId: string;
	centerName: string;
	kind: DeviceKind;
	label: string;
	condition: DeviceCondition;
	availability: DeviceAvailability;
	bookable: boolean;
};

export type PracticeBooking = {
	id: string;
	deviceId: string;
	label: string;
	kind: DeviceKind;
	startsAt: string;
	minutes: number;
};

type DeviceRow = typeof devices.$inferSelect;

/** A machine can be booked when it works and the center has marked it free. */
export function deviceIsBookable(device: {
	condition: string;
	availability: string;
}): boolean {
	return device.condition !== "broken" && device.availability === "available";
}

/** Two slots overlap when each starts before the other ends. */
export function slotsOverlap(
	leftStart: number,
	leftMinutes: number,
	rightStart: number,
	rightMinutes: number,
): boolean {
	const leftEnd = leftStart + leftMinutes * 60_000;
	const rightEnd = rightStart + rightMinutes * 60_000;
	return leftStart < rightEnd && rightStart < leftEnd;
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

function isUniqueViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if ("code" in error && error.code === "23505") return true;
	if ("cause" in error) return isUniqueViolation(error.cause);
	return false;
}

function asKind(value: string): DeviceKind {
	const kind = oneOf(value, DEVICE_KINDS);
	if (!kind)
		throw errors.badRequest("Choose a kind of device.", { reason: "kind" });
	return kind;
}

function asCondition(value: string): DeviceCondition {
	const condition = oneOf(value, DEVICE_CONDITIONS);
	if (!condition) {
		throw errors.badRequest("Choose the condition.", { reason: "condition" });
	}
	return condition;
}

function asAvailability(value: string): DeviceAvailability {
	const availability = oneOf(value, DEVICE_AVAILABILITY);
	if (!availability) {
		throw errors.badRequest("Choose whether it is free.", {
			reason: "availability",
		});
	}
	return availability;
}

function cleanLabel(value: string): string {
	const label = value.trim();
	if (label.length < 1 || label.length > LABEL_LIMIT) {
		throw errors.badRequest("Write a name for this device.", {
			reason: "label",
		});
	}
	return label;
}

async function writableCenterIds(
	database: DeviceDb,
	userId: number,
): Promise<Set<string>> {
	const staff = await centerStaffByRole(database, userId);
	return new Set([...staff.trainer, ...staff.center_manager]);
}

async function requireScope(
	database: DeviceDb,
	actorId: number,
	centerId: string,
): Promise<ReviewCenter> {
	const centers = await reviewCenters(database, actorId);
	const center = centers.find((item) => item.id === centerId);
	if (!center) throw errors.notFound("That device was not found.");
	return center;
}

async function learnerCenterIds(
	database: DeviceDb,
	learnerId: number,
): Promise<string[]> {
	const [home] = await database
		.select({ centerId: users.centerId, deletedAt: users.deletedAt })
		.from(users)
		.where(eq(users.id, learnerId))
		.limit(1);
	if (!home || home.deletedAt) return [];
	const enrolled = await database
		.select({ centerId: enrollments.centerId })
		.from(enrollments)
		.where(eq(enrollments.userId, learnerId));
	const ids = new Set<string>();
	if (home.centerId) ids.add(home.centerId);
	for (const row of enrolled) ids.add(row.centerId);
	return [...ids];
}

function toDevice(row: DeviceRow, centerName: string): CenterDevice {
	const kind = oneOf(row.kind, DEVICE_KINDS) ?? "computer";
	const condition = oneOf(row.condition, DEVICE_CONDITIONS) ?? "broken";
	const availability =
		oneOf(row.availability, DEVICE_AVAILABILITY) ?? "unavailable";
	return {
		id: row.id,
		centerId: row.centerId,
		centerName,
		kind,
		label: row.label,
		condition,
		availability,
		bookable: deviceIsBookable({ condition, availability }),
	};
}

/** Practice machines at the centers this person trains, manages, or coordinates. */
export async function listCenterDevices(
	database: DeviceDb,
	input: { actorId: number; centerId?: string },
): Promise<{
	items: CenterDevice[];
	centers: { id: string; name: string }[];
	canCreate: boolean;
}> {
	const centers = await reviewCenters(database, input.actorId);
	if (centers.length === 0) {
		throw errors.forbidden("You do not keep devices for a center.");
	}
	const allowed = new Set(centers.map((center) => center.id));
	if (input.centerId && !allowed.has(input.centerId)) {
		throw errors.notFound("That device was not found.");
	}
	const centerIds = input.centerId ? [input.centerId] : [...allowed];
	const names = new Map(centers.map((center) => [center.id, center.name]));
	const rows = await database
		.select()
		.from(devices)
		.where(inArray(devices.centerId, centerIds))
		.orderBy(asc(devices.label))
		.limit(100);
	const writable = await writableCenterIds(database, input.actorId);
	return {
		items: rows.map((row) => toDevice(row, names.get(row.centerId) ?? "")),
		centers: centers.map((center) => ({ id: center.id, name: center.name })),
		canCreate: centers.some((center) => writable.has(center.id)),
	};
}

export async function readCenterDevice(
	database: DeviceDb,
	input: { actorId: number; deviceId: string },
): Promise<CenterDevice> {
	const row = await loadDevice(database, input.deviceId);
	const center = await requireScope(database, input.actorId, row.centerId);
	return toDevice(row, center.name);
}

/** Add a computer, tablet, or router to a center the actor works at. */
export async function createCenterDevice(
	database: DeviceDb,
	input: {
		actorId: number;
		centerId: string;
		kind: string;
		label: string;
		condition: string;
		availability: string;
		ip: string;
	},
): Promise<{ id: string }> {
	if (!isUuid(input.centerId))
		throw errors.notFound("That device was not found.");
	const center = await requireScope(database, input.actorId, input.centerId);
	const writable = await writableCenterIds(database, input.actorId);
	if (!writable.has(center.id)) {
		throw errors.forbidden("You do not keep devices for a center.");
	}
	const kind = asKind(input.kind);
	const label = cleanLabel(input.label);
	const condition = asCondition(input.condition);
	const availability = asAvailability(input.availability);
	return database.transaction(async (tx) => {
		const [row] = await tx
			.insert(devices)
			.values({
				centerId: center.id,
				kind,
				label,
				condition,
				availability,
				createdByUserId: input.actorId,
			})
			.returning({ id: devices.id });
		if (!row) throw errors.internal("The device was not stored.");
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "device.created",
			targetType: "device",
			targetId: row.id,
			ipAddress: input.ip,
			metadata: { centerId: center.id },
		});
		return { id: row.id };
	});
}

/** Change the condition or whether the machine is free. */
export async function updateCenterDevice(
	database: DeviceDb,
	input: {
		actorId: number;
		deviceId: string;
		condition: string;
		availability: string;
		ip: string;
	},
): Promise<CenterDevice> {
	const row = await loadDevice(database, input.deviceId);
	const center = await requireScope(database, input.actorId, row.centerId);
	const writable = await writableCenterIds(database, input.actorId);
	if (!writable.has(center.id)) {
		throw errors.forbidden("You do not keep devices for a center.");
	}
	const condition = asCondition(input.condition);
	const availability = asAvailability(input.availability);
	return database.transaction(async (tx) => {
		const [saved] = await tx
			.update(devices)
			.set({ condition, availability })
			.where(eq(devices.id, row.id))
			.returning();
		if (!saved) throw errors.internal("The device was not stored.");
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "device.updated",
			targetType: "device",
			targetId: row.id,
			ipAddress: input.ip,
			metadata: { centerId: center.id },
		});
		return toDevice(saved, center.name);
	});
}

/** Bookable machines at the learner's centers, and the slots they already hold. */
export async function listPractice(
	database: DeviceDb,
	input: { learnerId: number; now?: Date },
): Promise<{ items: CenterDevice[]; bookings: PracticeBooking[] }> {
	const now = input.now ?? new Date();
	const centerIds = await learnerCenterIds(database, input.learnerId);
	if (centerIds.length === 0) return { items: [], bookings: [] };
	const centers = await database
		.select({ id: learningCenters.id, name: learningCenters.name })
		.from(learningCenters)
		.where(
			and(
				inArray(learningCenters.id, centerIds),
				eq(learningCenters.active, true),
			),
		);
	const names = new Map(centers.map((center) => [center.id, center.name]));
	const openIds = centers.map((center) => center.id);
	const rows =
		openIds.length === 0
			? []
			: await database
					.select()
					.from(devices)
					.where(inArray(devices.centerId, openIds))
					.orderBy(asc(devices.label))
					.limit(100);
	const bookings = await database
		.select({
			id: deviceBookings.id,
			deviceId: deviceBookings.deviceId,
			label: devices.label,
			kind: devices.kind,
			startsAt: deviceBookings.startsAt,
			minutes: deviceBookings.minutes,
		})
		.from(deviceBookings)
		.innerJoin(devices, eq(devices.id, deviceBookings.deviceId))
		.where(eq(deviceBookings.learnerUserId, input.learnerId))
		.orderBy(asc(deviceBookings.startsAt))
		.limit(20);
	return {
		items: rows
			.filter((row) => deviceIsBookable(row))
			.map((row) => toDevice(row, names.get(row.centerId) ?? "")),
		bookings: bookings
			.filter(
				(row) => row.startsAt.getTime() + row.minutes * 60_000 > now.getTime(),
			)
			.map((row) => ({
				id: row.id,
				deviceId: row.deviceId,
				label: row.label,
				kind: oneOf(row.kind, DEVICE_KINDS) ?? "computer",
				startsAt: row.startsAt.toISOString(),
				minutes: row.minutes,
			})),
	};
}

async function loadDevice(
	database: DeviceDb,
	deviceId: string,
): Promise<DeviceRow> {
	if (!isUuid(deviceId)) throw errors.notFound("That device was not found.");
	const [row] = await database
		.select()
		.from(devices)
		.where(eq(devices.id, deviceId))
		.limit(1);
	if (!row) throw errors.notFound("That device was not found.");
	return row;
}

/** Reserve a practice slot. The same booking id does not create a second row. */
export async function bookPracticeSlot(
	database: DeviceDb,
	input: {
		learnerId: number;
		deviceId: string;
		bookingId: string;
		startsAt: string;
		minutes: number;
		ip: string;
		now?: Date;
	},
): Promise<PracticeBooking> {
	if (!isUuid(input.bookingId)) {
		throw errors.badRequest("That booking id is not usable.", { reason: "id" });
	}
	const now = input.now ?? new Date();
	const device = await loadDevice(database, input.deviceId);
	const centers = await learnerCenterIds(database, input.learnerId);
	if (!centers.includes(device.centerId)) {
		throw errors.notFound("That device was not found.");
	}
	const [existing] = await database
		.select()
		.from(deviceBookings)
		.where(eq(deviceBookings.id, input.bookingId))
		.limit(1);
	if (existing) {
		if (
			existing.deviceId === device.id &&
			existing.learnerUserId === input.learnerId
		) {
			return {
				id: existing.id,
				deviceId: existing.deviceId,
				label: device.label,
				kind: asKind(device.kind),
				startsAt: existing.startsAt.toISOString(),
				minutes: existing.minutes,
			};
		}
		throw errors.conflict("That booking id was already used.", {
			reason: "id",
		});
	}
	if (!deviceIsBookable(device)) {
		throw errors.conflict("This device is not free to book.", {
			reason: "device",
		});
	}
	const minutes = input.minutes;
	if (
		!Number.isInteger(minutes) ||
		minutes < MIN_MINUTES ||
		minutes > MAX_MINUTES
	) {
		throw errors.badRequest("Minutes must be from 30 to 180.", {
			reason: "minutes",
		});
	}
	const startsAt = new Date(input.startsAt);
	if (Number.isNaN(startsAt.getTime())) {
		throw errors.badRequest("Choose a date and time.", { reason: "time" });
	}
	if (
		startsAt.getTime() <= now.getTime() ||
		startsAt.getTime() > now.getTime() + BOOK_AHEAD_MS
	) {
		throw errors.badRequest("Choose a time in the next two weeks.", {
			reason: "time",
		});
	}
	const held = await database
		.select({
			startsAt: deviceBookings.startsAt,
			minutes: deviceBookings.minutes,
		})
		.from(deviceBookings)
		.where(eq(deviceBookings.deviceId, device.id))
		.limit(200);
	const clash = held.some((row) =>
		slotsOverlap(
			startsAt.getTime(),
			minutes,
			row.startsAt.getTime(),
			row.minutes,
		),
	);
	if (clash) {
		throw errors.conflict("That time is already booked.", {
			reason: "overlap",
		});
	}
	try {
		return await database.transaction(async (tx) => {
			const [row] = await tx
				.insert(deviceBookings)
				.values({
					id: input.bookingId,
					deviceId: device.id,
					learnerUserId: input.learnerId,
					startsAt,
					minutes,
				})
				.returning();
			if (!row) throw errors.internal("The booking was not stored.");
			await writeAudit(tx, {
				actorId: input.learnerId,
				action: "device.booked",
				targetType: "device",
				targetId: device.id,
				ipAddress: input.ip,
				metadata: { deviceId: device.id },
			});
			return {
				id: row.id,
				deviceId: row.deviceId,
				label: device.label,
				kind: asKind(device.kind),
				startsAt: row.startsAt.toISOString(),
				minutes: row.minutes,
			};
		});
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		const [again] = await database
			.select()
			.from(deviceBookings)
			.where(eq(deviceBookings.id, input.bookingId))
			.limit(1);
		if (
			again &&
			again.deviceId === device.id &&
			again.learnerUserId === input.learnerId
		) {
			return {
				id: again.id,
				deviceId: again.deviceId,
				label: device.label,
				kind: asKind(device.kind),
				startsAt: again.startsAt.toISOString(),
				minutes: again.minutes,
			};
		}
		throw errors.conflict("That booking id was already used.", {
			reason: "id",
		});
	}
}
