import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import type { Database } from "../../db";
import {
	learningCenters,
	popupAttendance,
	popupHomeLinks,
	popupSessions,
	popupSignups,
	popupTours,
	roles,
	sectors,
	userRoles,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { ROLE_PERMISSIONS } from "../authz/catalog";
import type { Assignment } from "../authz/decide";

type TourDb = Pick<Database, "insert" | "select" | "update" | "transaction">;

export type TourCenter = { id: string; name: string };

export type TourSession = {
	id: string;
	topic: string;
	startsAt: string;
	minutes: number;
	capacity: number;
	signedUp: number;
};

export type TourPerson = {
	userId: number;
	name: string;
	sessionId: string;
	attended: boolean;
	linked: boolean;
};

export type TourRow = {
	id: string;
	place: string;
	homeCenterId: string;
	homeCenterName: string;
	sessions: TourSession[];
	people: TourPerson[];
};

export type TourList = {
	tours: TourRow[];
	centers: TourCenter[];
};

export type OpenTour = {
	id: string;
	place: string;
	homeCenter: string;
	topic: string;
	startsAt: string;
	placesLeft: number;
	signedUp: boolean;
};

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value,
	);
}

function canRun(assignments: readonly Assignment[]): boolean {
	return assignments.some((assignment) => {
		const permissions = ROLE_PERMISSIONS[assignment.role];
		return (
			permissions.includes("center.manage") ||
			permissions.includes("district.manage")
		);
	});
}

function requireRunner(assignments: readonly Assignment[]): void {
	if (!canRun(assignments)) {
		throw errors.forbidden(
			"A center manager or a district coordinator runs a tour.",
			{ reason: "tour" },
		);
	}
}

function requireLearner(assignments: readonly Assignment[]): void {
	if (!assignments.some((assignment) => assignment.role === "learner")) {
		throw errors.forbidden("A learner signs up for a tour.", {
			reason: "tour",
		});
	}
}

function allowedCenter(
	assignments: readonly Assignment[],
	centerId: string,
	districtId: string,
): boolean {
	return assignments.some((assignment) => {
		const permissions = ROLE_PERMISSIONS[assignment.role];
		if (
			permissions.includes("center.manage") &&
			(assignment.scopeType === "global" ||
				(assignment.scopeType === "center" && assignment.scopeId === centerId))
		) {
			return true;
		}
		if (
			permissions.includes("district.manage") &&
			(assignment.scopeType === "global" ||
				(assignment.scopeType === "district" &&
					assignment.scopeId === districtId))
		) {
			return true;
		}
		return false;
	});
}

function requirePlace(value: string): string {
	const place = value.trim();
	if (place.length < 1 || place.length > 120) {
		throw errors.badRequest("Write the place.", { reason: "tour" });
	}
	return place;
}

function requireTopic(value: string): string {
	const topic = value.trim();
	if (topic.length < 1 || topic.length > 120) {
		throw errors.badRequest("Write the topic.", { reason: "tour" });
	}
	return topic;
}

function requireMinutes(value: number): number {
	if (!Number.isInteger(value) || value < 15 || value > 480) {
		throw errors.badRequest("Write how long the session lasts.", {
			reason: "tour",
		});
	}
	return value;
}

function requireCapacity(value: number): number {
	if (!Number.isInteger(value) || value < 1 || value > 500) {
		throw errors.badRequest("Write how many people can come.", {
			reason: "tour",
		});
	}
	return value;
}

function requireStart(value: string): Date {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		throw errors.badRequest("Write when the session starts.", {
			reason: "tour",
		});
	}
	if (parsed.getTime() <= Date.now()) {
		throw errors.badRequest("Write a time that is still ahead.", {
			reason: "tour",
		});
	}
	return parsed;
}

async function learnerInRole(
	database: TourDb,
	userId: number,
): Promise<boolean> {
	const [row] = await database
		.select({ id: users.id })
		.from(users)
		.innerJoin(userRoles, eq(userRoles.userId, users.id))
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(
			and(
				eq(users.id, userId),
				eq(roles.code, "learner"),
				isNull(userRoles.suspendedAt),
				isNull(users.deletedAt),
			),
		)
		.limit(1);
	return Boolean(row);
}

async function centerFor(
	database: TourDb,
	centerId: string,
): Promise<{ id: string; name: string; districtId: string } | null> {
	if (!isUuid(centerId)) return null;
	const [center] = await database
		.select({
			id: learningCenters.id,
			name: learningCenters.name,
			districtId: sectors.districtId,
		})
		.from(learningCenters)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(
			and(eq(learningCenters.id, centerId), eq(learningCenters.active, true)),
		)
		.limit(1);
	return center ?? null;
}

async function centersFor(
	database: TourDb,
	assignments: readonly Assignment[],
): Promise<TourCenter[]> {
	const rows = await database
		.select({
			id: learningCenters.id,
			name: learningCenters.name,
			districtId: sectors.districtId,
		})
		.from(learningCenters)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(eq(learningCenters.active, true))
		.orderBy(asc(learningCenters.name));
	return rows.flatMap((row) =>
		allowedCenter(assignments, row.id, row.districtId)
			? [{ id: row.id, name: row.name }]
			: [],
	);
}

/** Tours a manager or coordinator can run, and the centers they can point home. */
export async function readTours(
	database: TourDb,
	assignments: readonly Assignment[],
): Promise<TourList> {
	requireRunner(assignments);
	const centers = await centersFor(database, assignments);
	if (centers.length === 0) return { tours: [], centers: [] };
	const stored = await database
		.select({
			id: popupTours.id,
			place: popupTours.place,
			homeCenterId: popupTours.homeCenterId,
			homeCenterName: learningCenters.name,
		})
		.from(popupTours)
		.innerJoin(learningCenters, eq(learningCenters.id, popupTours.homeCenterId))
		.where(
			inArray(
				popupTours.homeCenterId,
				centers.map((center) => center.id),
			),
		)
		.orderBy(asc(popupTours.place));
	if (stored.length === 0) return { tours: [], centers };
	const sessions = await database
		.select({
			id: popupSessions.id,
			tourId: popupSessions.tourId,
			topic: popupSessions.topic,
			startsAt: popupSessions.startsAt,
			minutes: popupSessions.minutes,
			capacity: popupSessions.capacity,
		})
		.from(popupSessions)
		.where(
			inArray(
				popupSessions.tourId,
				stored.map((tour) => tour.id),
			),
		)
		.orderBy(asc(popupSessions.startsAt));
	const signups =
		sessions.length === 0
			? []
			: await database
					.select({
						sessionId: popupSignups.sessionId,
						userId: popupSignups.userId,
						name: users.name,
					})
					.from(popupSignups)
					.innerJoin(users, eq(users.id, popupSignups.userId))
					.where(
						inArray(
							popupSignups.sessionId,
							sessions.map((session) => session.id),
						),
					);
	const attended = new Set(
		signups.length === 0
			? []
			: (
					await database
						.select({
							sessionId: popupAttendance.sessionId,
							userId: popupAttendance.userId,
						})
						.from(popupAttendance)
						.where(
							inArray(
								popupAttendance.sessionId,
								sessions.map((session) => session.id),
							),
						)
				).map((row) => `${row.sessionId}:${row.userId}`),
	);
	const linked = new Set(
		(
			await database
				.select({
					tourId: popupHomeLinks.tourId,
					userId: popupHomeLinks.userId,
				})
				.from(popupHomeLinks)
				.where(
					inArray(
						popupHomeLinks.tourId,
						stored.map((tour) => tour.id),
					),
				)
		).map((row) => `${row.tourId}:${row.userId}`),
	);
	const tours = stored.map((tour) => {
		const ownSessions = sessions.filter(
			(session) => session.tourId === tour.id,
		);
		return {
			id: tour.id,
			place: tour.place,
			homeCenterId: tour.homeCenterId,
			homeCenterName: tour.homeCenterName,
			sessions: ownSessions.map((session) => ({
				id: session.id,
				topic: session.topic,
				startsAt: session.startsAt.toISOString(),
				minutes: session.minutes,
				capacity: session.capacity,
				signedUp: signups.filter((row) => row.sessionId === session.id).length,
			})),
			people: signups.flatMap((row) => {
				const session = ownSessions.find((item) => item.id === row.sessionId);
				if (!session) return [];
				const name = row.name?.trim() ?? "";
				if (!name) return [];
				return [
					{
						userId: row.userId,
						name,
						sessionId: row.sessionId,
						attended: attended.has(`${row.sessionId}:${row.userId}`),
						linked: linked.has(`${tour.id}:${row.userId}`),
					},
				];
			}),
		};
	});
	return { tours, centers };
}

/** Upcoming pop-up sessions a learner can join. */
export async function readOpenTours(
	database: TourDb,
	input: { userId: number; assignments: readonly Assignment[] },
): Promise<{ sessions: OpenTour[] }> {
	requireLearner(input.assignments);
	const now = new Date();
	const sessions = await database
		.select({
			id: popupSessions.id,
			topic: popupSessions.topic,
			startsAt: popupSessions.startsAt,
			capacity: popupSessions.capacity,
			place: popupTours.place,
			homeCenter: learningCenters.name,
		})
		.from(popupSessions)
		.innerJoin(popupTours, eq(popupTours.id, popupSessions.tourId))
		.innerJoin(learningCenters, eq(learningCenters.id, popupTours.homeCenterId))
		.where(gt(popupSessions.startsAt, now))
		.orderBy(asc(popupSessions.startsAt));
	if (sessions.length === 0) return { sessions: [] };
	const signups = await database
		.select({
			sessionId: popupSignups.sessionId,
			userId: popupSignups.userId,
		})
		.from(popupSignups)
		.where(
			inArray(
				popupSignups.sessionId,
				sessions.map((session) => session.id),
			),
		);
	return {
		sessions: sessions.map((session) => {
			const taken = signups.filter((row) => row.sessionId === session.id);
			return {
				id: session.id,
				place: session.place,
				homeCenter: session.homeCenter,
				topic: session.topic,
				startsAt: session.startsAt.toISOString(),
				placesLeft: Math.max(0, session.capacity - taken.length),
				signedUp: taken.some((row) => row.userId === input.userId),
			};
		}),
	};
}

/** Store a temporary place and the center people return to. */
export async function createTour(
	database: TourDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		place: string;
		homeCenterId: string;
		ip?: string;
	},
): Promise<{ id: string }> {
	requireRunner(input.assignments);
	const place = requirePlace(input.place);
	const center = await centerFor(database, input.homeCenterId);
	if (!center) throw errors.notFound("This center was not found.");
	if (!allowedCenter(input.assignments, center.id, center.districtId)) {
		throw errors.forbidden("Choose a center you run.", { reason: "tour" });
	}
	const [created] = await database
		.insert(popupTours)
		.values({
			place,
			homeCenterId: center.id,
			createdByUserId: input.actorId,
		})
		.returning({ id: popupTours.id });
	if (!created) throw errors.internal("The tour was not stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "tour.created",
		targetType: "popup_tour",
		targetId: created.id,
		ipAddress: input.ip,
	});
	return { id: created.id };
}

/** Add one session. The place does not change. */
export async function createTourSession(
	database: TourDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		tourId: string;
		topic: string;
		startsAt: string;
		minutes: number;
		capacity: number;
		ip?: string;
	},
): Promise<{ id: string }> {
	requireRunner(input.assignments);
	if (!isUuid(input.tourId)) throw errors.notFound("This tour was not found.");
	const topic = requireTopic(input.topic);
	const startsAt = requireStart(input.startsAt);
	const minutes = requireMinutes(input.minutes);
	const capacity = requireCapacity(input.capacity);
	const [tour] = await database
		.select({
			id: popupTours.id,
			homeCenterId: popupTours.homeCenterId,
			districtId: sectors.districtId,
		})
		.from(popupTours)
		.innerJoin(learningCenters, eq(learningCenters.id, popupTours.homeCenterId))
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(eq(popupTours.id, input.tourId))
		.limit(1);
	if (!tour) throw errors.notFound("This tour was not found.");
	if (!allowedCenter(input.assignments, tour.homeCenterId, tour.districtId)) {
		throw errors.forbidden("Choose a center you run.", { reason: "tour" });
	}
	const [created] = await database
		.insert(popupSessions)
		.values({
			tourId: tour.id,
			topic,
			startsAt,
			minutes,
			capacity,
			createdByUserId: input.actorId,
		})
		.returning({ id: popupSessions.id });
	if (!created) throw errors.internal("The session was not stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "tour.session_created",
		targetType: "popup_session",
		targetId: created.id,
		ipAddress: input.ip,
	});
	return { id: created.id };
}

/** A learner takes one place. */
export async function signUpForTour(
	database: TourDb,
	input: {
		userId: number;
		assignments: readonly Assignment[];
		sessionId: string;
		ip?: string;
	},
): Promise<{ sessionId: string }> {
	requireLearner(input.assignments);
	if (!isUuid(input.sessionId)) {
		throw errors.notFound("This session was not found.");
	}
	if (!(await learnerInRole(database, input.userId))) {
		throw errors.badRequest("Choose a learner.", { reason: "tour" });
	}
	const [session] = await database
		.select({
			id: popupSessions.id,
			startsAt: popupSessions.startsAt,
			capacity: popupSessions.capacity,
		})
		.from(popupSessions)
		.where(eq(popupSessions.id, input.sessionId))
		.limit(1);
	if (!session) throw errors.notFound("This session was not found.");
	if (session.startsAt.getTime() <= Date.now()) {
		throw errors.badRequest("This session has already started.", {
			reason: "tour",
		});
	}
	const signups = await database
		.select({ userId: popupSignups.userId })
		.from(popupSignups)
		.where(eq(popupSignups.sessionId, session.id));
	if (signups.some((row) => row.userId === input.userId)) {
		throw errors.conflict("This person is already signed up.", {
			reason: "tour",
		});
	}
	if (signups.length >= session.capacity) {
		throw errors.conflict("Every place is taken.", { reason: "tour" });
	}
	await database.insert(popupSignups).values({
		sessionId: session.id,
		userId: input.userId,
	});
	await writeAudit(database, {
		actorId: input.userId,
		action: "tour.signed_up",
		targetType: "popup_session",
		targetId: session.id,
		ipAddress: input.ip,
	});
	return { sessionId: session.id };
}

/** Mark that a signed-up learner came. */
export async function attendTour(
	database: TourDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		sessionId: string;
		userId: number;
		ip?: string;
	},
): Promise<{ sessionId: string }> {
	requireRunner(input.assignments);
	if (!isUuid(input.sessionId)) {
		throw errors.notFound("This session was not found.");
	}
	const [session] = await database
		.select({
			id: popupSessions.id,
			homeCenterId: popupTours.homeCenterId,
			districtId: sectors.districtId,
		})
		.from(popupSessions)
		.innerJoin(popupTours, eq(popupTours.id, popupSessions.tourId))
		.innerJoin(learningCenters, eq(learningCenters.id, popupTours.homeCenterId))
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(eq(popupSessions.id, input.sessionId))
		.limit(1);
	if (!session) throw errors.notFound("This session was not found.");
	if (
		!allowedCenter(input.assignments, session.homeCenterId, session.districtId)
	) {
		throw errors.forbidden("Choose a center you run.", { reason: "tour" });
	}
	const [signup] = await database
		.select({ userId: popupSignups.userId })
		.from(popupSignups)
		.where(
			and(
				eq(popupSignups.sessionId, session.id),
				eq(popupSignups.userId, input.userId),
			),
		)
		.limit(1);
	if (!signup) {
		throw errors.badRequest("This person has not signed up.", {
			reason: "tour",
		});
	}
	const [existing] = await database
		.select({ userId: popupAttendance.userId })
		.from(popupAttendance)
		.where(
			and(
				eq(popupAttendance.sessionId, session.id),
				eq(popupAttendance.userId, input.userId),
			),
		)
		.limit(1);
	if (existing) {
		throw errors.conflict("Attendance is already marked.", { reason: "tour" });
	}
	await database.insert(popupAttendance).values({
		sessionId: session.id,
		userId: input.userId,
		markedByUserId: input.actorId,
	});
	await writeAudit(database, {
		actorId: input.actorId,
		action: "tour.attended",
		targetType: "popup_session",
		targetId: session.id,
		ipAddress: input.ip,
	});
	return { sessionId: session.id };
}

/** After attendance, the learner's home center becomes the tour's center. */
export async function linkTourHome(
	database: TourDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		tourId: string;
		userId: number;
		ip?: string;
	},
): Promise<{ tourId: string }> {
	requireRunner(input.assignments);
	if (!isUuid(input.tourId)) throw errors.notFound("This tour was not found.");
	const [tour] = await database
		.select({
			id: popupTours.id,
			homeCenterId: popupTours.homeCenterId,
			districtId: sectors.districtId,
		})
		.from(popupTours)
		.innerJoin(learningCenters, eq(learningCenters.id, popupTours.homeCenterId))
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(eq(popupTours.id, input.tourId))
		.limit(1);
	if (!tour) throw errors.notFound("This tour was not found.");
	if (!allowedCenter(input.assignments, tour.homeCenterId, tour.districtId)) {
		throw errors.forbidden("Choose a center you run.", { reason: "tour" });
	}
	const attended = await database
		.select({ sessionId: popupAttendance.sessionId })
		.from(popupAttendance)
		.innerJoin(popupSessions, eq(popupSessions.id, popupAttendance.sessionId))
		.where(
			and(
				eq(popupSessions.tourId, tour.id),
				eq(popupAttendance.userId, input.userId),
			),
		)
		.limit(1);
	if (attended.length === 0) {
		throw errors.badRequest("Mark attendance before linking a home center.", {
			reason: "tour",
		});
	}
	const [linked] = await database
		.select({ userId: popupHomeLinks.userId })
		.from(popupHomeLinks)
		.where(
			and(
				eq(popupHomeLinks.tourId, tour.id),
				eq(popupHomeLinks.userId, input.userId),
			),
		)
		.limit(1);
	if (linked) {
		throw errors.conflict("This person is already linked.", { reason: "tour" });
	}
	const [person] = await database
		.select({ centerId: users.centerId })
		.from(users)
		.where(eq(users.id, input.userId))
		.limit(1);
	if (!person) throw errors.notFound("This person was not found.");
	if (person.centerId === tour.homeCenterId) {
		throw errors.conflict("This person already uses that center.", {
			reason: "tour",
		});
	}
	await database.insert(popupHomeLinks).values({
		tourId: tour.id,
		userId: input.userId,
		centerId: tour.homeCenterId,
		linkedByUserId: input.actorId,
	});
	await database
		.update(users)
		.set({ centerId: tour.homeCenterId })
		.where(eq(users.id, input.userId));
	await writeAudit(database, {
		actorId: input.actorId,
		action: "tour.linked",
		targetType: "popup_tour",
		targetId: tour.id,
		ipAddress: input.ip,
	});
	return { tourId: tour.id };
}
