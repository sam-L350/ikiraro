import { randomBytes } from "node:crypto";
import { and, asc, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import QRCode from "qrcode";
import type { Database } from "../../db";
import {
	centerSessions,
	courses,
	courseTranslations,
	digitalPassports,
	enrollments,
	learningCenters,
	sessionAttendance,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { centerStaffByRole } from "../geography/centers";
import { type ReviewCenter, reviewCenters } from "./review-queue";

const TOPIC_LIMIT = 120;
const MIN_MINUTES = 15;
const MAX_MINUTES = 480;
const MIN_CAPACITY = 1;
const MAX_CAPACITY = 500;
const LIST_LIMIT = 50;
const ROSTER_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SessionDb = Pick<Database, "insert" | "select" | "transaction" | "update">;

export type SessionMethod = "tick" | "qr";

export type SessionListItem = {
	id: string;
	topic: string;
	centerId: string;
	centerName: string;
	courseId: string | null;
	courseTitleRw: string | null;
	courseTitleEn: string | null;
	trainerName: string;
	startsAt: string;
	minutes: number;
	capacity: number;
	taken: number;
	open: boolean;
};

export type ScheduleItem = {
	id: string;
	topic: string;
	centerName: string;
	courseTitleRw: string | null;
	courseTitleEn: string | null;
	trainerName: string;
	startsAt: string;
	minutes: number;
	open: boolean;
	attended: boolean;
};

export type SessionLearner = {
	id: number;
	name: string;
	attended: boolean;
};

export type SessionDetail = SessionListItem & {
	checkInToken: string;
	checkInUrl: string;
	checkInQr: string;
	canMark: boolean;
	learners: SessionLearner[];
};

export type SessionJoin = {
	topic: string;
	centerName: string;
	trainerName: string;
	startsAt: string;
	minutes: number;
	open: boolean;
	attended: boolean;
};

export type StoredAttendance = {
	id: string;
	sessionId: string;
	learnerId: number;
	method: SessionMethod;
	minutes: number;
};

type SessionRow = typeof centerSessions.$inferSelect;

/** A session accepts attendance from its start through the end of its minutes. */
export function sessionIsOpen(
	startsAt: Date,
	minutes: number,
	now: Date,
): boolean {
	const start = startsAt.getTime();
	const at = now.getTime();
	if (Number.isNaN(start) || Number.isNaN(at)) return false;
	if (!Number.isFinite(minutes) || minutes <= 0) return false;
	return at >= start && at <= start + minutes * 60_000;
}

function isUuid(value: string): boolean {
	return UUID_RE.test(value);
}

function cleanTopic(value: string): string | null {
	const topic = value.trim();
	if (topic.length < 1 || topic.length > TOPIC_LIMIT) return null;
	return topic;
}

function wholeNumber(value: number, min: number, max: number): number | null {
	if (!Number.isInteger(value) || value < min || value > max) return null;
	return value;
}

function isUniqueViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if ("code" in error && error.code === "23505") return true;
	if ("cause" in error) return isUniqueViolation(error.cause);
	return false;
}

function displayName(name: string | null): string {
	return name?.trim() ?? "";
}

function stillAhead(startsAt: Date, minutes: number, now: Date): boolean {
	return startsAt.getTime() + minutes * 60_000 > now.getTime();
}

async function writableCenterIds(
	database: SessionDb,
	userId: number,
): Promise<Set<string>> {
	const staff = await centerStaffByRole(database, userId);
	return new Set([...staff.trainer, ...staff.center_manager]);
}

async function requireScope(
	database: SessionDb,
	actorId: number,
	centerId: string,
): Promise<ReviewCenter> {
	const centers = await reviewCenters(database, actorId);
	const center = centers.find((item) => item.id === centerId);
	if (!center) throw errors.notFound("That session was not found.");
	return center;
}

async function trainerAtCenter(
	database: SessionDb,
	trainerUserId: number,
	centerId: string,
): Promise<boolean> {
	const staff = await centerStaffByRole(database, trainerUserId);
	return (
		staff.trainer.includes(centerId) || staff.center_manager.includes(centerId)
	);
}

async function learnerAtCenter(
	database: SessionDb,
	learnerId: number,
	centerId: string,
): Promise<boolean> {
	const [home] = await database
		.select({ centerId: users.centerId, deletedAt: users.deletedAt })
		.from(users)
		.where(eq(users.id, learnerId))
		.limit(1);
	if (!home || home.deletedAt) return false;
	if (home.centerId === centerId) return true;
	const [enrolled] = await database
		.select({ id: enrollments.id })
		.from(enrollments)
		.where(
			and(
				eq(enrollments.userId, learnerId),
				eq(enrollments.centerId, centerId),
			),
		)
		.limit(1);
	return Boolean(enrolled);
}

async function canTick(
	database: SessionDb,
	actorId: number,
	session: SessionRow,
): Promise<boolean> {
	if (session.trainerUserId === actorId) return true;
	const staff = await centerStaffByRole(database, actorId);
	return staff.center_manager.includes(session.centerId);
}

type CourseTitles = { rw: string | null; en: string | null };

async function titlesFor(
	database: SessionDb,
	courseIds: readonly string[],
): Promise<Map<string, CourseTitles>> {
	const map = new Map<string, CourseTitles>();
	if (courseIds.length === 0) return map;
	const rows = await database
		.select({
			courseId: courseTranslations.courseId,
			locale: courseTranslations.locale,
			title: courseTranslations.title,
		})
		.from(courseTranslations)
		.where(inArray(courseTranslations.courseId, [...courseIds]));
	for (const row of rows) {
		const current = map.get(row.courseId) ?? { rw: null, en: null };
		if (row.locale === "rw") current.rw = row.title;
		if (row.locale === "en") current.en = row.title;
		map.set(row.courseId, current);
	}
	return map;
}

async function takenBySession(
	database: SessionDb,
	sessionIds: readonly string[],
): Promise<Map<string, number>> {
	const map = new Map<string, number>();
	if (sessionIds.length === 0) return map;
	const rows = await database
		.select({
			sessionId: sessionAttendance.sessionId,
			taken: count(),
		})
		.from(sessionAttendance)
		.where(inArray(sessionAttendance.sessionId, [...sessionIds]))
		.groupBy(sessionAttendance.sessionId);
	for (const row of rows) map.set(row.sessionId, Number(row.taken));
	return map;
}

function listItem(
	row: {
		id: string;
		topic: string;
		centerId: string;
		centerName: string;
		courseId: string | null;
		trainerName: string | null;
		startsAt: Date;
		minutes: number;
		capacity: number;
		cancelledAt: Date | null;
	},
	titles: CourseTitles | undefined,
	taken: number,
	now: Date,
): SessionListItem {
	const course = titles ?? { rw: null, en: null };
	return {
		id: row.id,
		topic: row.topic,
		centerId: row.centerId,
		centerName: row.centerName,
		courseId: row.courseId,
		courseTitleRw: course.rw,
		courseTitleEn: course.en,
		trainerName: displayName(row.trainerName),
		startsAt: row.startsAt.toISOString(),
		minutes: row.minutes,
		capacity: row.capacity,
		taken,
		open:
			row.cancelledAt === null && sessionIsOpen(row.startsAt, row.minutes, now),
	};
}

/** Sessions at centers this person trains, manages, or coordinates. */
export async function listCenterSessions(
	database: SessionDb,
	input: { actorId: number; centerId?: string; now?: Date },
): Promise<{
	items: SessionListItem[];
	centers: { id: string; name: string }[];
	canCreate: boolean;
}> {
	const centers = await reviewCenters(database, input.actorId);
	if (centers.length === 0) {
		throw errors.forbidden("You do not run a session for a center.");
	}
	const allowed = new Set(centers.map((center) => center.id));
	if (input.centerId && !allowed.has(input.centerId)) {
		throw errors.notFound("That session was not found.");
	}
	const centerIds = input.centerId ? [input.centerId] : [...allowed];
	const now = input.now ?? new Date();
	const rows = await database
		.select({
			id: centerSessions.id,
			topic: centerSessions.topic,
			centerId: centerSessions.centerId,
			centerName: learningCenters.name,
			courseId: centerSessions.courseId,
			trainerName: users.name,
			startsAt: centerSessions.startsAt,
			minutes: centerSessions.minutes,
			capacity: centerSessions.capacity,
			cancelledAt: centerSessions.cancelledAt,
		})
		.from(centerSessions)
		.innerJoin(learningCenters, eq(learningCenters.id, centerSessions.centerId))
		.innerJoin(users, eq(users.id, centerSessions.trainerUserId))
		.where(
			and(
				inArray(centerSessions.centerId, centerIds),
				isNull(centerSessions.cancelledAt),
				gte(centerSessions.startsAt, new Date(now.getTime() - DAY_MS)),
			),
		)
		.orderBy(asc(centerSessions.startsAt))
		.limit(LIST_LIMIT);
	const courseIds = rows.flatMap((row) => (row.courseId ? [row.courseId] : []));
	const [titles, taken, writable] = await Promise.all([
		titlesFor(database, courseIds),
		takenBySession(
			database,
			rows.map((row) => row.id),
		),
		writableCenterIds(database, input.actorId),
	]);
	return {
		items: rows.map((row) =>
			listItem(
				row,
				row.courseId ? titles.get(row.courseId) : undefined,
				taken.get(row.id) ?? 0,
				now,
			),
		),
		centers: centers.map((center) => ({ id: center.id, name: center.name })),
		canCreate: centers.some((center) => writable.has(center.id)),
	};
}

/** Upcoming sessions at the learner's home center. */
export async function listLearnerSchedule(
	database: SessionDb,
	input: { learnerId: number; now?: Date },
): Promise<{ items: ScheduleItem[] }> {
	const now = input.now ?? new Date();
	const [home] = await database
		.select({ centerId: users.centerId })
		.from(users)
		.where(eq(users.id, input.learnerId))
		.limit(1);
	if (!home?.centerId) return { items: [] };
	const rows = await database
		.select({
			id: centerSessions.id,
			topic: centerSessions.topic,
			centerName: learningCenters.name,
			courseId: centerSessions.courseId,
			trainerName: users.name,
			startsAt: centerSessions.startsAt,
			minutes: centerSessions.minutes,
		})
		.from(centerSessions)
		.innerJoin(learningCenters, eq(learningCenters.id, centerSessions.centerId))
		.innerJoin(users, eq(users.id, centerSessions.trainerUserId))
		.where(
			and(
				eq(centerSessions.centerId, home.centerId),
				isNull(centerSessions.cancelledAt),
				gte(centerSessions.startsAt, new Date(now.getTime() - DAY_MS)),
			),
		)
		.orderBy(asc(centerSessions.startsAt))
		.limit(LIST_LIMIT);
	const ahead = rows.filter((row) =>
		stillAhead(row.startsAt, row.minutes, now),
	);
	const courseIds = ahead.flatMap((row) =>
		row.courseId ? [row.courseId] : [],
	);
	const titles = await titlesFor(database, courseIds);
	const marks =
		ahead.length === 0
			? []
			: await database
					.select({ sessionId: sessionAttendance.sessionId })
					.from(sessionAttendance)
					.where(
						and(
							eq(sessionAttendance.learnerUserId, input.learnerId),
							inArray(
								sessionAttendance.sessionId,
								ahead.map((row) => row.id),
							),
						),
					);
	const attended = new Set(marks.map((mark) => mark.sessionId));
	return {
		items: ahead.map((row) => {
			const course = row.courseId ? titles.get(row.courseId) : undefined;
			return {
				id: row.id,
				topic: row.topic,
				centerName: row.centerName,
				courseTitleRw: course?.rw ?? null,
				courseTitleEn: course?.en ?? null,
				trainerName: displayName(row.trainerName),
				startsAt: row.startsAt.toISOString(),
				minutes: row.minutes,
				open: sessionIsOpen(row.startsAt, row.minutes, now),
				attended: attended.has(row.id),
			};
		}),
	};
}

async function loadSession(
	database: SessionDb,
	sessionId: string,
): Promise<SessionRow> {
	if (!isUuid(sessionId)) throw errors.notFound("That session was not found.");
	const [row] = await database
		.select()
		.from(centerSessions)
		.where(eq(centerSessions.id, sessionId))
		.limit(1);
	if (!row) throw errors.notFound("That session was not found.");
	return row;
}

/** The roster, the check-in code, and whether this person may tick names. */
export async function readCenterSession(
	database: SessionDb,
	input: { actorId: number; sessionId: string; origin: string; now?: Date },
): Promise<SessionDetail> {
	const now = input.now ?? new Date();
	const session = await loadSession(database, input.sessionId);
	await requireScope(database, input.actorId, session.centerId);
	const [center] = await database
		.select({ name: learningCenters.name })
		.from(learningCenters)
		.where(eq(learningCenters.id, session.centerId))
		.limit(1);
	const [trainer] = await database
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, session.trainerUserId))
		.limit(1);
	const titles = session.courseId
		? await titlesFor(database, [session.courseId])
		: new Map<string, CourseTitles>();
	const takenMap = await takenBySession(database, [session.id]);
	const people = await roster(database, session.centerId);
	const marks = people.length
		? await database
				.select({ learnerUserId: sessionAttendance.learnerUserId })
				.from(sessionAttendance)
				.where(
					and(
						eq(sessionAttendance.sessionId, session.id),
						inArray(
							sessionAttendance.learnerUserId,
							people.map((person) => person.id),
						),
					),
				)
		: [];
	const present = new Set(marks.map((mark) => mark.learnerUserId));
	const checkInUrl = `${input.origin.replace(/\/$/, "")}/schedule/join/${session.checkInToken}`;
	const checkInQr = await QRCode.toDataURL(checkInUrl, {
		margin: 1,
		width: 180,
	});
	const item = listItem(
		{
			id: session.id,
			topic: session.topic,
			centerId: session.centerId,
			centerName: center?.name ?? "",
			courseId: session.courseId,
			trainerName: trainer?.name ?? null,
			startsAt: session.startsAt,
			minutes: session.minutes,
			capacity: session.capacity,
			cancelledAt: session.cancelledAt,
		},
		session.courseId ? titles.get(session.courseId) : undefined,
		takenMap.get(session.id) ?? 0,
		now,
	);
	return {
		...item,
		checkInToken: session.checkInToken,
		checkInUrl,
		checkInQr,
		canMark: await canTick(database, input.actorId, session),
		learners: people.map((person) => ({
			id: person.id,
			name: person.name,
			attended: present.has(person.id),
		})),
	};
}

async function roster(
	database: SessionDb,
	centerId: string,
): Promise<{ id: number; name: string }[]> {
	const home = await database
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(and(eq(users.centerId, centerId), isNull(users.deletedAt)))
		.limit(ROSTER_LIMIT);
	const enrolled = await database
		.select({ id: users.id, name: users.name })
		.from(enrollments)
		.innerJoin(users, eq(users.id, enrollments.userId))
		.where(and(eq(enrollments.centerId, centerId), isNull(users.deletedAt)))
		.limit(ROSTER_LIMIT);
	const byId = new Map<number, string>();
	for (const person of [...home, ...enrolled]) {
		byId.set(person.id, displayName(person.name));
	}
	return [...byId.entries()]
		.slice(0, ROSTER_LIMIT)
		.map(([id, name]) => ({ id, name }));
}

/** What a learner sees after opening a check-in code. The token is not repeated. */
export async function readSessionJoin(
	database: SessionDb,
	input: { learnerId: number; token: string; now?: Date },
): Promise<SessionJoin> {
	const now = input.now ?? new Date();
	const token = input.token.trim();
	if (token.length < 16) throw errors.notFound("That session was not found.");
	const [session] = await database
		.select()
		.from(centerSessions)
		.where(eq(centerSessions.checkInToken, token))
		.limit(1);
	if (!session) throw errors.notFound("That session was not found.");
	if (!(await learnerAtCenter(database, input.learnerId, session.centerId))) {
		throw errors.notFound("That session was not found.");
	}
	const [center] = await database
		.select({ name: learningCenters.name })
		.from(learningCenters)
		.where(eq(learningCenters.id, session.centerId))
		.limit(1);
	const [trainer] = await database
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, session.trainerUserId))
		.limit(1);
	const [mark] = await database
		.select({ id: sessionAttendance.id })
		.from(sessionAttendance)
		.where(
			and(
				eq(sessionAttendance.sessionId, session.id),
				eq(sessionAttendance.learnerUserId, input.learnerId),
			),
		)
		.limit(1);
	return {
		topic: session.topic,
		centerName: center?.name ?? "",
		trainerName: displayName(trainer?.name ?? null),
		startsAt: session.startsAt.toISOString(),
		minutes: session.minutes,
		open:
			session.cancelledAt === null &&
			sessionIsOpen(session.startsAt, session.minutes, now),
		attended: Boolean(mark),
	};
}

/** A trainer or center manager puts a session on the schedule. */
export async function createCenterSession(
	database: SessionDb,
	input: {
		actorId: number;
		centerId: string;
		topic: string;
		courseId?: string;
		trainerUserId: number;
		startsAt: string;
		minutes: number;
		capacity: number;
		ip: string;
	},
): Promise<{ id: string }> {
	if (!isUuid(input.centerId)) {
		throw errors.notFound("That session was not found.");
	}
	const center = await requireScope(database, input.actorId, input.centerId);
	const writable = await writableCenterIds(database, input.actorId);
	if (!writable.has(center.id)) {
		throw errors.forbidden("You do not run a session for a center.");
	}
	const topic = cleanTopic(input.topic);
	if (!topic) {
		throw errors.badRequest("Write a topic.", { reason: "topic" });
	}
	const minutes = wholeNumber(input.minutes, MIN_MINUTES, MAX_MINUTES);
	if (minutes === null) {
		throw errors.badRequest("Minutes must be from 15 to 480.", {
			reason: "minutes",
		});
	}
	const capacity = wholeNumber(input.capacity, MIN_CAPACITY, MAX_CAPACITY);
	if (capacity === null) {
		throw errors.badRequest("Places must be from 1 to 500.", {
			reason: "capacity",
		});
	}
	const startsAt = new Date(input.startsAt);
	if (Number.isNaN(startsAt.getTime())) {
		throw errors.badRequest("Choose a date and time.", { reason: "time" });
	}
	if (!(await trainerAtCenter(database, input.trainerUserId, center.id))) {
		throw errors.badRequest("That trainer does not work at this center.", {
			reason: "trainer",
		});
	}
	let courseId: string | null = null;
	if (input.courseId) {
		if (!isUuid(input.courseId)) {
			throw errors.notFound("That course was not found.");
		}
		courseId = input.courseId;
		const [course] = await database
			.select({ id: courses.id })
			.from(courses)
			.where(eq(courses.id, courseId))
			.limit(1);
		if (!course) throw errors.notFound("That course was not found.");
	}
	const token = randomBytes(16).toString("hex");
	return database.transaction(async (tx) => {
		const [row] = await tx
			.insert(centerSessions)
			.values({
				centerId: center.id,
				courseId,
				topic,
				trainerUserId: input.trainerUserId,
				startsAt,
				minutes,
				capacity,
				checkInToken: token,
				createdByUserId: input.actorId,
			})
			.returning({ id: centerSessions.id });
		if (!row) throw errors.internal("The session was not stored.");
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "session.created",
			targetType: "center_session",
			targetId: row.id,
			ipAddress: input.ip,
			metadata: { centerId: center.id },
		});
		return { id: row.id };
	});
}

/** How many sessions a learner has been marked present for. */
export async function countAttendedSessions(
	database: SessionDb,
	userId: number,
): Promise<number> {
	const [row] = await database
		.select({ taken: count() })
		.from(sessionAttendance)
		.where(eq(sessionAttendance.learnerUserId, userId));
	return Number(row?.taken ?? 0);
}

function stored(row: {
	id: string;
	sessionId: string;
	learnerUserId: number;
	method: string;
	minutes: number;
}): StoredAttendance {
	const method: SessionMethod = row.method === "qr" ? "qr" : "tick";
	return {
		id: row.id,
		sessionId: row.sessionId,
		learnerId: row.learnerUserId,
		method,
		minutes: row.minutes,
	};
}

async function recordAttendance(
	database: SessionDb,
	input: {
		actorId: number;
		session: SessionRow;
		learnerId: number;
		attendanceId: string;
		method: SessionMethod;
		ip: string;
		now: Date;
	},
): Promise<StoredAttendance> {
	if (!isUuid(input.attendanceId)) {
		throw errors.badRequest("That attendance id is not usable.", {
			reason: "id",
		});
	}
	const [existing] = await database
		.select()
		.from(sessionAttendance)
		.where(eq(sessionAttendance.id, input.attendanceId))
		.limit(1);
	if (existing) {
		if (
			existing.sessionId === input.session.id &&
			existing.learnerUserId === input.learnerId
		) {
			return stored(existing);
		}
		throw errors.conflict("That attendance id was already used.", {
			reason: "id",
		});
	}
	if (input.session.cancelledAt !== null) {
		throw errors.conflict("This session is not open.", { reason: "window" });
	}
	if (
		!sessionIsOpen(input.session.startsAt, input.session.minutes, input.now)
	) {
		throw errors.conflict("This session is not open.", { reason: "window" });
	}
	if (
		!(await learnerAtCenter(database, input.learnerId, input.session.centerId))
	) {
		throw errors.notFound("That learner was not found.");
	}
	try {
		return await database.transaction(async (tx) => {
			const [pair] = await tx
				.select({ id: sessionAttendance.id })
				.from(sessionAttendance)
				.where(
					and(
						eq(sessionAttendance.sessionId, input.session.id),
						eq(sessionAttendance.learnerUserId, input.learnerId),
					),
				)
				.limit(1);
			if (pair) {
				throw errors.conflict("This learner is already marked.", {
					reason: "duplicate",
				});
			}
			const [takenRow] = await tx
				.select({ taken: count() })
				.from(sessionAttendance)
				.where(eq(sessionAttendance.sessionId, input.session.id));
			if (Number(takenRow?.taken ?? 0) >= input.session.capacity) {
				throw errors.conflict("This session is full.", { reason: "full" });
			}
			const [row] = await tx
				.insert(sessionAttendance)
				.values({
					id: input.attendanceId,
					sessionId: input.session.id,
					learnerUserId: input.learnerId,
					method: input.method,
					minutes: input.session.minutes,
					markedByUserId: input.actorId,
				})
				.returning();
			if (!row) throw errors.internal("The attendance was not stored.");
			const [passport] = await tx
				.update(digitalPassports)
				.set({
					verifiedMinutes: sql`${digitalPassports.verifiedMinutes} + ${input.session.minutes}`,
				})
				.where(eq(digitalPassports.userId, input.learnerId))
				.returning({ id: digitalPassports.id });
			if (!passport) throw errors.internal("The passport was not found.");
			await writeAudit(tx, {
				actorId: input.actorId,
				action: "attendance.marked",
				targetType: "center_session",
				targetId: input.session.id,
				ipAddress: input.ip,
				metadata: { sessionId: input.session.id, method: input.method },
			});
			return stored(row);
		});
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		const [again] = await database
			.select()
			.from(sessionAttendance)
			.where(eq(sessionAttendance.id, input.attendanceId))
			.limit(1);
		if (
			again &&
			again.sessionId === input.session.id &&
			again.learnerUserId === input.learnerId
		) {
			return stored(again);
		}
		throw errors.conflict("This learner is already marked.", {
			reason: "duplicate",
		});
	}
}

/** The session's trainer, or a manager of that center, ticks a learner. */
export async function markSessionAttendance(
	database: SessionDb,
	input: {
		actorId: number;
		sessionId: string;
		learnerId: number;
		attendanceId: string;
		ip: string;
		now?: Date;
	},
): Promise<StoredAttendance> {
	const session = await loadSession(database, input.sessionId);
	await requireScope(database, input.actorId, session.centerId);
	if (!(await canTick(database, input.actorId, session))) {
		throw errors.forbidden("You do not mark attendance for this session.");
	}
	return recordAttendance(database, {
		actorId: input.actorId,
		session,
		learnerId: input.learnerId,
		attendanceId: input.attendanceId,
		method: "tick",
		ip: input.ip,
		now: input.now ?? new Date(),
	});
}

/** A learner checks in with the session code. */
export async function checkInToSession(
	database: SessionDb,
	input: {
		learnerId: number;
		token: string;
		attendanceId: string;
		ip: string;
		now?: Date;
	},
): Promise<StoredAttendance> {
	const token = input.token.trim();
	const [session] = await database
		.select()
		.from(centerSessions)
		.where(eq(centerSessions.checkInToken, token))
		.limit(1);
	if (!session) throw errors.notFound("That session was not found.");
	return recordAttendance(database, {
		actorId: input.learnerId,
		session,
		learnerId: input.learnerId,
		attendanceId: input.attendanceId,
		method: "qr",
		ip: input.ip,
		now: input.now ?? new Date(),
	});
}
