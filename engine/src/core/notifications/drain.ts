import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	centerStaff,
	contentVersions,
	districts,
	domainEvents,
	enrollments,
	type JsonValue,
	learningCenters,
	notificationPreferences,
	notifications,
	notificationTemplates,
	roles,
	sectors,
	submissionVerifications,
	taskProgress,
	taskSubmissions,
	userRoles,
	users,
} from "../../db/schema";
import { writeEvent } from "../audit/write";
import { notificationSmsToday, readDailyCap } from "../sms/cap";
import { recordAcceptedSend } from "../sms/charges";
import { smsSender } from "../sms/select";
import type { SmsSender } from "../sms/sender";
import { SMS_SEND_LIMIT as SEND_LIMIT, SmsPermanentError } from "../sms/sender";
import { type EmailSender, holdingEmailSender } from "./email";
import {
	defaultChannelEnabled,
	ensureDefaultTemplates,
	isNotificationChannel,
	isNotificationEvent,
	isNotificationLocale,
	NOTIFICATION_CHANNELS,
	type NotificationChannel,
	type NotificationEvent,
	type NotificationLocale,
	renderTemplate,
} from "./templates";

const BATCH = 25;
const STALL_SCAN = 100;

type NotifyDb = Pick<Database, "insert" | "select" | "update" | "transaction">;

type Planned = {
	userId: number;
	eventName: NotificationEvent;
	vars: Record<string, string>;
	titleOverride?: string;
};

type TemplateRow = {
	eventName: string;
	channel: string;
	locale: string;
	title: string;
	body: string;
};

export type DrainDeps = {
	sms?: SmsSender;
	email?: EmailSender;
};

function record(value: JsonValue): Record<string, JsonValue> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value;
}

function text(value: JsonValue | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
}

function whole(value: JsonValue | undefined): number | null {
	if (typeof value !== "number" || !Number.isInteger(value)) return null;
	return value;
}

function localeOf(value: string): NotificationLocale {
	return isNotificationLocale(value) ? value : "rw";
}

async function submissionAudience(
	database: Pick<Database, "select">,
	submissionId: string,
): Promise<{ ownerUserId: number; centerId: string } | null> {
	const [row] = await database
		.select({
			ownerUserId: taskSubmissions.ownerUserId,
			centerId: enrollments.centerId,
		})
		.from(taskSubmissions)
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.where(eq(taskSubmissions.id, submissionId))
		.limit(1);
	return row ?? null;
}

async function ownerFromVerification(
	database: Pick<Database, "select">,
	verificationId: string,
): Promise<number | null> {
	const [row] = await database
		.select({ ownerUserId: taskSubmissions.ownerUserId })
		.from(submissionVerifications)
		.innerJoin(
			taskSubmissions,
			eq(taskSubmissions.id, submissionVerifications.submissionId),
		)
		.where(eq(submissionVerifications.id, verificationId))
		.limit(1);
	return row?.ownerUserId ?? null;
}

async function managersAtCenter(
	database: Pick<Database, "select">,
	centerId: string,
): Promise<number[]> {
	const rows = await database
		.select({ userId: centerStaff.userId })
		.from(centerStaff)
		.where(
			and(
				eq(centerStaff.centerId, centerId),
				eq(centerStaff.role, "center_manager"),
			),
		);
	return rows.map((row) => row.userId);
}

async function coordinatorsForCenter(
	database: Pick<Database, "select">,
	centerId: string,
): Promise<number[]> {
	const [center] = await database
		.select({ districtId: sectors.districtId })
		.from(learningCenters)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(eq(learningCenters.id, centerId))
		.limit(1);
	if (!center) return [];
	const rows = await database
		.select({ userId: userRoles.userId })
		.from(userRoles)
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(
			and(
				eq(roles.code, "district_coordinator"),
				eq(userRoles.scopeType, "district"),
				eq(userRoles.scopeId, center.districtId),
				isNull(userRoles.suspendedAt),
			),
		);
	return rows.map((row) => row.userId);
}

async function staffAtCenter(
	database: Pick<Database, "select">,
	centerId: string,
): Promise<number[]> {
	const rows = await database
		.select({ userId: centerStaff.userId })
		.from(centerStaff)
		.where(eq(centerStaff.centerId, centerId));
	return rows.map((row) => row.userId);
}

async function peopleAtCenters(
	database: Pick<Database, "select">,
	centerIds: readonly string[],
): Promise<number[]> {
	if (centerIds.length === 0) return [];
	const homes = await database
		.select({ id: users.id })
		.from(users)
		.where(
			and(
				inArray(users.centerId, [...centerIds]),
				isNull(users.deletedAt),
				isNull(users.deactivatedAt),
			),
		);
	const enrolled = await database
		.select({ userId: enrollments.userId })
		.from(enrollments)
		.where(inArray(enrollments.centerId, [...centerIds]));
	const staff = await database
		.select({ userId: centerStaff.userId })
		.from(centerStaff)
		.where(inArray(centerStaff.centerId, [...centerIds]));
	return [
		...homes.map((row) => row.id),
		...enrolled.map((row) => row.userId),
		...staff.map((row) => row.userId),
	];
}

async function centersInDistrict(
	database: Pick<Database, "select">,
	districtId: string,
): Promise<string[]> {
	const rows = await database
		.select({ id: learningCenters.id })
		.from(learningCenters)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.innerJoin(districts, eq(districts.id, sectors.districtId))
		.where(and(eq(districts.id, districtId), eq(learningCenters.active, true)));
	return rows.map((row) => row.id);
}

async function planEvent(
	database: Pick<Database, "select">,
	name: string,
	payload: JsonValue,
): Promise<Planned[] | "ignore" | "retry"> {
	if (!isNotificationEvent(name)) return "ignore";
	const body = record(payload);
	if (!body) return "retry";
	switch (name) {
		case "submission.created": {
			const submissionId = text(body.submissionId);
			if (!submissionId) return "retry";
			const audience = await submissionAudience(database, submissionId);
			if (!audience) return "retry";
			const staff = await staffAtCenter(database, audience.centerId);
			const ids = [...new Set([audience.ownerUserId, ...staff])];
			return ids.map((userId) => ({
				userId,
				eventName: name,
				vars: {},
			}));
		}
		case "submission.approved":
		case "submission.needs_revision":
		case "submission.rejected": {
			const submissionId = text(body.submissionId);
			if (!submissionId) return "retry";
			const audience = await submissionAudience(database, submissionId);
			if (!audience) return "retry";
			const notes: Planned[] = [
				{ userId: audience.ownerUserId, eventName: name, vars: {} },
			];
			const points = whole(body.points);
			if (name === "submission.approved" && points !== null && points !== 0) {
				notes.push({
					userId: audience.ownerUserId,
					eventName: "points.adjusted",
					vars: { points: String(points) },
				});
			}
			return notes;
		}
		case "badge.awarded":
		case "grant.decided":
		case "follow_up.due":
		case "learner.stalled": {
			const userId = whole(body.userId);
			if (userId === null) return "retry";
			return [{ userId, eventName: name, vars: {} }];
		}
		case "points.adjusted": {
			const points = whole(body.points);
			const direct = whole(body.userId);
			const verificationId = text(body.verificationId);
			const userId =
				direct ??
				(verificationId
					? await ownerFromVerification(database, verificationId)
					: null);
			if (userId === null || points === null) return "retry";
			return [
				{
					userId,
					eventName: name,
					vars: { points: String(points) },
				},
			];
		}
		case "submission.escalated": {
			const submissionId = text(body.submissionId);
			const stage = text(body.stage);
			if (!submissionId || (stage !== "manager" && stage !== "district")) {
				return "retry";
			}
			const audience = await submissionAudience(database, submissionId);
			if (!audience) return "retry";
			const ids =
				stage === "manager"
					? await managersAtCenter(database, audience.centerId)
					: await coordinatorsForCenter(database, audience.centerId);
			return [...new Set(ids)].map((userId) => ({
				userId,
				eventName: name,
				vars: {},
			}));
		}
		case "announcement.posted": {
			const scope = text(body.scope);
			const scopeId = text(body.scopeId);
			const message = text(body.message);
			const title = text(body.title);
			if (!scopeId || !message || !title) return "retry";
			if (scope !== "center" && scope !== "district") return "retry";
			const centerIds =
				scope === "center"
					? [scopeId]
					: await centersInDistrict(database, scopeId);
			const ids = [...new Set(await peopleAtCenters(database, centerIds))];
			return ids.map((userId) => ({
				userId,
				eventName: name,
				vars: { message },
				titleOverride: title,
			}));
		}
		default: {
			const unreachable: never = name;
			return unreachable;
		}
	}
}

function templateFor(
	rows: readonly TemplateRow[],
	eventName: NotificationEvent,
	channel: NotificationChannel,
	locale: NotificationLocale,
): { title: string; body: string } | null {
	const match =
		rows.find(
			(row) =>
				row.eventName === eventName &&
				row.channel === channel &&
				row.locale === locale,
		) ??
		rows.find(
			(row) =>
				row.eventName === eventName &&
				row.channel === channel &&
				row.locale === "en",
		);
	if (!match) return null;
	return { title: match.title, body: match.body };
}

async function rowsFor(
	database: Pick<Database, "select">,
	eventId: string,
	planned: readonly Planned[],
): Promise<
	{
		userId: number;
		eventId: string;
		eventName: string;
		channel: string;
		title: string;
		body: string;
		status: "queued" | "sent";
		sentAt: Date | null;
	}[]
> {
	if (planned.length === 0) return [];
	const userIds = [...new Set(planned.map((item) => item.userId))];
	const people = await database
		.select({
			id: users.id,
			phone: users.phone,
			email: users.email,
			locale: users.locale,
			deletedAt: users.deletedAt,
			deactivatedAt: users.deactivatedAt,
		})
		.from(users)
		.where(inArray(users.id, userIds));
	const personById = new Map(people.map((person) => [person.id, person]));
	const eventNames = [...new Set(planned.map((item) => item.eventName))];
	const prefs = await database
		.select({
			userId: notificationPreferences.userId,
			eventName: notificationPreferences.eventName,
			channel: notificationPreferences.channel,
			enabled: notificationPreferences.enabled,
		})
		.from(notificationPreferences)
		.where(
			and(
				inArray(notificationPreferences.userId, userIds),
				inArray(notificationPreferences.eventName, eventNames),
			),
		);
	const prefKey = (userId: number, eventName: string, channel: string) =>
		`${userId}:${eventName}:${channel}`;
	const prefByKey = new Map(
		prefs.map((pref) => [
			prefKey(pref.userId, pref.eventName, pref.channel),
			pref.enabled,
		]),
	);
	const templates = await database
		.select({
			eventName: notificationTemplates.eventName,
			channel: notificationTemplates.channel,
			locale: notificationTemplates.locale,
			title: notificationTemplates.title,
			body: notificationTemplates.body,
		})
		.from(notificationTemplates)
		.where(inArray(notificationTemplates.eventName, eventNames));
	const now = new Date();
	const built: {
		userId: number;
		eventId: string;
		eventName: string;
		channel: string;
		title: string;
		body: string;
		status: "queued" | "sent";
		sentAt: Date | null;
	}[] = [];
	for (const note of planned) {
		const person = personById.get(note.userId);
		if (!person || person.deletedAt || person.deactivatedAt) continue;
		const locale = localeOf(person.locale);
		for (const channel of NOTIFICATION_CHANNELS) {
			const stored = prefByKey.get(
				prefKey(note.userId, note.eventName, channel),
			);
			const enabled = stored ?? defaultChannelEnabled(channel);
			if (!enabled) continue;
			if (channel === "sms" && !person.phone) continue;
			if (channel === "email" && !person.email) continue;
			const template = templateFor(templates, note.eventName, channel, locale);
			if (!template) continue;
			const title =
				note.titleOverride ?? renderTemplate(template.title, note.vars);
			const body = renderTemplate(template.body, note.vars).trim();
			if (!title.trim() || !body) continue;
			built.push({
				userId: note.userId,
				eventId,
				eventName: note.eventName,
				channel,
				title: title.trim(),
				body,
				status: channel === "in_app" ? "sent" : "queued",
				sentAt: channel === "in_app" ? now : null,
			});
		}
	}
	return built;
}

async function rememberStalledLearners(database: NotifyDb): Promise<string[]> {
	const reminded = await database
		.select({ payload: domainEvents.payload })
		.from(domainEvents)
		.where(eq(domainEvents.name, "learner.stalled"));
	const already = new Set(
		reminded.flatMap((row) => {
			const enrollmentId = text(record(row.payload)?.enrollmentId);
			return enrollmentId ? [enrollmentId] : [];
		}),
	);
	const progressed = await database
		.select({ enrollmentId: taskProgress.enrollmentId })
		.from(taskProgress)
		.where(eq(taskProgress.status, "complete"));
	const pendingIds = [
		...new Set(
			progressed
				.map((row) => row.enrollmentId)
				.filter((id) => !already.has(id)),
		),
	].slice(0, STALL_SCAN);
	if (pendingIds.length === 0) return [];
	const pins = await database
		.select({
			id: enrollments.id,
			userId: enrollments.userId,
			snapshot: contentVersions.snapshot,
		})
		.from(enrollments)
		.innerJoin(
			contentVersions,
			eq(contentVersions.id, enrollments.contentVersionId),
		)
		.where(inArray(enrollments.id, pendingIds));
	const progress = await database
		.select({
			enrollmentId: taskProgress.enrollmentId,
			taskId: taskProgress.taskId,
		})
		.from(taskProgress)
		.where(
			and(
				inArray(taskProgress.enrollmentId, pendingIds),
				eq(taskProgress.status, "complete"),
			),
		);
	const doneByEnrollment = new Map<string, Set<string>>();
	for (const row of progress) {
		const set = doneByEnrollment.get(row.enrollmentId) ?? new Set<string>();
		set.add(row.taskId);
		doneByEnrollment.set(row.enrollmentId, set);
	}
	const created: string[] = [];
	for (const pin of pins) {
		const required = requiredTaskIds(pin.snapshot);
		if (!required) continue;
		const done = doneByEnrollment.get(pin.id) ?? new Set<string>();
		let complete = 0;
		for (const taskId of required) {
			if (done.has(taskId)) complete += 1;
		}
		const remaining = required.length - complete;
		if (complete < 1 || remaining !== 1) continue;
		created.push(
			await writeEvent(database, {
				name: "learner.stalled",
				payload: { userId: pin.userId, enrollmentId: pin.id },
			}),
		);
	}
	return created;
}

function requiredTaskIds(snapshot: JsonValue): string[] | null {
	const course = record(snapshot);
	const badge = course ? record(course.badge ?? null) : null;
	const rule = badge ? record(badge.rule ?? null) : null;
	if (!course || !rule || rule.allRequiredTasksApproved !== true) return null;
	const modules = course.modules;
	if (!Array.isArray(modules)) return null;
	const ids: string[] = [];
	for (const module of modules) {
		const moduleRecord = record(module);
		const tasks = moduleRecord?.tasks;
		if (!Array.isArray(tasks)) continue;
		for (const task of tasks) {
			const taskRecord = record(task);
			const id = taskRecord ? text(taskRecord.id) : null;
			if (taskRecord?.required === true && id) ids.push(id);
		}
	}
	return ids.length > 0 ? ids : null;
}

async function deliverQueued(
	database: NotifyDb,
	sms: SmsSender,
	email: EmailSender,
	eventIds?: readonly string[],
): Promise<void> {
	if (eventIds && eventIds.length === 0) return;
	const cap = await readDailyCap(database);
	const sentToday = new Map<number, number>();
	const waiting = await database
		.select({
			id: notifications.id,
			userId: notifications.userId,
			channel: notifications.channel,
			title: notifications.title,
			body: notifications.body,
			attempts: notifications.attempts,
			lastError: notifications.lastError,
			phone: users.phone,
			email: users.email,
			centerId: users.centerId,
		})
		.from(notifications)
		.innerJoin(users, eq(users.id, notifications.userId))
		.where(
			and(
				inArray(notifications.channel, ["sms", "email"]),
				eq(notifications.status, "queued"),
				sql`${notifications.attempts} < ${SEND_LIMIT}`,
				eventIds ? inArray(notifications.eventId, [...eventIds]) : undefined,
			),
		)
		.orderBy(asc(notifications.createdAt))
		.limit(BATCH);
	for (const row of waiting) {
		if (!isNotificationChannel(row.channel)) continue;
		switch (row.channel) {
			case "in_app":
				continue;
			case "email": {
				if (!row.email) continue;
				try {
					const result = await email.send({
						to: row.email,
						subject: row.title,
						body: row.body,
					});
					if (result === "not_configured") {
						if (row.lastError === "email_not_configured") continue;
						await database
							.update(notifications)
							.set({ lastError: "email_not_configured" })
							.where(eq(notifications.id, row.id));
						continue;
					}
					await database
						.update(notifications)
						.set({ status: "sent", sentAt: new Date(), lastError: null })
						.where(eq(notifications.id, row.id));
				} catch {
					await markSendFailed(database, row.id, row.attempts, "email_failed");
				}
				continue;
			}
			case "sms": {
				if (!row.phone) continue;
				const used =
					sentToday.get(row.userId) ??
					(await notificationSmsToday(database, row.userId, new Date(), cap));
				sentToday.set(row.userId, used);
				if (used >= cap) {
					if (row.lastError === "daily_cap") continue;
					await database
						.update(notifications)
						.set({ lastError: "daily_cap" })
						.where(eq(notifications.id, row.id));
					continue;
				}
				try {
					const result = await sms.send({ to: row.phone, body: row.body });
					const accepted = await recordAcceptedSend(database, row, result);
					if (accepted === "submitted") {
						sentToday.set(row.userId, used + 1);
					}
				} catch (error) {
					if (error instanceof SmsPermanentError) {
						await database
							.update(notifications)
							.set({
								status: "failed",
								attempts: row.attempts + 1,
								lastError: "sms_rejected",
							})
							.where(eq(notifications.id, row.id));
						continue;
					}
					await markSendFailed(database, row.id, row.attempts, "sms_failed");
				}
				continue;
			}
			default: {
				const unreachable: never = row.channel;
				throw new Error(unreachable);
			}
		}
	}
}

async function markSendFailed(
	database: NotifyDb,
	id: string,
	attemptsSoFar: number,
	reason: string,
): Promise<void> {
	const attempts = attemptsSoFar + 1;
	await database
		.update(notifications)
		.set({
			attempts,
			lastError: reason,
			status: attempts >= SEND_LIMIT ? "failed" : "queued",
		})
		.where(eq(notifications.id, id));
}

/**
 * Turn unprocessed domain events into inbox rows, then try SMS and email
 * outside the request that wrote the event. A failed SMS stays queued.
 */
export async function drainNotifications(
	database: NotifyDb,
	deps: DrainDeps = {},
	options: { eventIds?: readonly string[]; sweepStalled?: boolean } = {},
): Promise<void> {
	const sms = deps.sms ?? smsSender();
	const email = deps.email ?? holdingEmailSender;
	const only = options.eventIds;
	const limited = only !== undefined;
	await ensureDefaultTemplates(database);
	const stalledIds =
		options.sweepStalled === false
			? []
			: await rememberStalledLearners(database);
	const wanted = limited ? [...only, ...stalledIds] : [];
	const events = limited
		? wanted.length === 0
			? []
			: await database
					.select({
						id: domainEvents.id,
						name: domainEvents.name,
						payload: domainEvents.payload,
						attempts: domainEvents.attempts,
					})
					.from(domainEvents)
					.where(
						and(
							inArray(domainEvents.id, wanted),
							isNull(domainEvents.processedAt),
						),
					)
		: await database
				.select({
					id: domainEvents.id,
					name: domainEvents.name,
					payload: domainEvents.payload,
					attempts: domainEvents.attempts,
				})
				.from(domainEvents)
				.where(isNull(domainEvents.processedAt))
				.orderBy(asc(domainEvents.createdAt))
				.limit(BATCH);
	for (const event of events) {
		try {
			const planned = await planEvent(database, event.name, event.payload);
			if (planned === "retry") {
				const attempts = event.attempts + 1;
				await database
					.update(domainEvents)
					.set({
						attempts,
						processedAt: attempts >= SEND_LIMIT ? new Date() : null,
					})
					.where(
						and(
							eq(domainEvents.id, event.id),
							isNull(domainEvents.processedAt),
						),
					);
				continue;
			}
			const notes = planned === "ignore" ? [] : planned;
			const rows = await rowsFor(database, event.id, notes);
			await database.transaction(async (tx) => {
				if (rows.length > 0) {
					await tx
						.insert(notifications)
						.values(rows)
						.onConflictDoNothing({
							target: [
								notifications.eventId,
								notifications.userId,
								notifications.channel,
								notifications.eventName,
							],
						});
				}
				await tx
					.update(domainEvents)
					.set({ processedAt: new Date() })
					.where(
						and(
							eq(domainEvents.id, event.id),
							isNull(domainEvents.processedAt),
						),
					);
			});
		} catch {
			const attempts = event.attempts + 1;
			await database
				.update(domainEvents)
				.set({
					attempts,
					processedAt: attempts >= SEND_LIMIT ? new Date() : null,
				})
				.where(
					and(eq(domainEvents.id, event.id), isNull(domainEvents.processedAt)),
				);
		}
	}
	await deliverQueued(database, sms, email, limited ? wanted : undefined);
}
