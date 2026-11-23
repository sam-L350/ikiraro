import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../../db";
import {
	notificationPreferences,
	notifications,
	notificationTemplates,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import {
	isNotificationChannel,
	isNotificationEvent,
	isNotificationLocale,
	NOTIFICATION_EVENTS,
	type NotificationChannel,
	type NotificationEvent,
	renderTemplate,
} from "./templates";

type InboxDb = Pick<Database, "insert" | "select" | "update">;

export type InboxDelivery =
	| "queued"
	| "submitted"
	| "sent"
	| "failed"
	| "capped"
	| "none";

export type InboxItem = {
	id: string;
	eventName: NotificationEvent;
	title: string;
	body: string;
	createdAt: string;
	readAt: string | null;
	sms: InboxDelivery;
	email: InboxDelivery;
};

function deliveryOf(
	status: string | undefined,
	lastError: string | null | undefined,
): InboxDelivery {
	if (status === "queued" && lastError === "daily_cap") return "capped";
	switch (status) {
		case "queued":
		case "submitted":
		case "sent":
		case "failed":
			return status;
		case undefined:
			return "none";
		default:
			return "none";
	}
}

/** In-app messages for one person, newest first, with the outbound status beside them. */
export async function listInbox(
	database: Pick<Database, "select">,
	userId: number,
): Promise<InboxItem[]> {
	const rows = await database
		.select({
			id: notifications.id,
			eventId: notifications.eventId,
			eventName: notifications.eventName,
			title: notifications.title,
			body: notifications.body,
			createdAt: notifications.createdAt,
			readAt: notifications.readAt,
		})
		.from(notifications)
		.where(
			and(
				eq(notifications.userId, userId),
				eq(notifications.channel, "in_app"),
			),
		)
		.orderBy(desc(notifications.createdAt))
		.limit(50);
	const eventIds = rows.flatMap((row) => (row.eventId ? [row.eventId] : []));
	const outbound =
		eventIds.length === 0
			? []
			: await database
					.select({
						eventId: notifications.eventId,
						eventName: notifications.eventName,
						channel: notifications.channel,
						status: notifications.status,
						lastError: notifications.lastError,
					})
					.from(notifications)
					.where(
						and(
							eq(notifications.userId, userId),
							inArray(notifications.eventId, eventIds),
							inArray(notifications.channel, ["sms", "email"]),
						),
					);
	return rows.flatMap((row) => {
		if (!isNotificationEvent(row.eventName)) return [];
		const sms = outbound.find(
			(item) =>
				item.eventId === row.eventId &&
				item.eventName === row.eventName &&
				item.channel === "sms",
		);
		const email = outbound.find(
			(item) =>
				item.eventId === row.eventId &&
				item.eventName === row.eventName &&
				item.channel === "email",
		);
		return [
			{
				id: row.id,
				eventName: row.eventName,
				title: row.title,
				body: row.body,
				createdAt: row.createdAt.toISOString(),
				readAt: row.readAt ? row.readAt.toISOString() : null,
				sms: deliveryOf(sms?.status, sms?.lastError),
				email: deliveryOf(email?.status, email?.lastError),
			},
		];
	});
}

export async function markNotificationRead(
	database: InboxDb,
	input: { id: string; userId: number },
): Promise<InboxItem> {
	const [owned] = await database
		.select({ id: notifications.id, readAt: notifications.readAt })
		.from(notifications)
		.where(
			and(
				eq(notifications.id, input.id),
				eq(notifications.userId, input.userId),
				eq(notifications.channel, "in_app"),
			),
		)
		.limit(1);
	if (!owned) throw errors.notFound("That message was not found.");
	if (!owned.readAt) {
		await database
			.update(notifications)
			.set({ readAt: new Date() })
			.where(and(eq(notifications.id, owned.id), isNull(notifications.readAt)));
	}
	const items = await listInbox(database, input.userId);
	const item = items.find((row) => row.id === owned.id);
	if (!item) throw errors.notFound("That message was not found.");
	return item;
}

export type PreferenceView = {
	eventName: NotificationEvent;
	inApp: boolean;
	sms: boolean;
	email: boolean;
};

export async function listNotificationPreferences(
	database: Pick<Database, "select">,
	userId: number,
): Promise<PreferenceView[]> {
	const rows = await database
		.select({
			eventName: notificationPreferences.eventName,
			channel: notificationPreferences.channel,
			enabled: notificationPreferences.enabled,
		})
		.from(notificationPreferences)
		.where(eq(notificationPreferences.userId, userId));
	return NOTIFICATION_EVENTS.map((eventName) => {
		const chosen = (channel: NotificationChannel) => {
			const row = rows.find(
				(item) => item.eventName === eventName && item.channel === channel,
			);
			if (!row) {
				switch (channel) {
					case "in_app":
					case "sms":
						return true;
					case "email":
						return false;
					default: {
						const unreachable: never = channel;
						return unreachable;
					}
				}
			}
			return row.enabled;
		};
		return {
			eventName,
			inApp: chosen("in_app"),
			sms: chosen("sms"),
			email: chosen("email"),
		};
	});
}

export async function updateNotificationPreference(
	database: InboxDb,
	input: {
		userId: number;
		eventName: string;
		channel: string;
		enabled: boolean;
	},
): Promise<PreferenceView[]> {
	if (!isNotificationEvent(input.eventName)) {
		throw errors.badRequest("That event is not known.", { reason: "event" });
	}
	if (!isNotificationChannel(input.channel)) {
		throw errors.badRequest("That channel is not known.", {
			reason: "channel",
		});
	}
	await database
		.insert(notificationPreferences)
		.values({
			userId: input.userId,
			eventName: input.eventName,
			channel: input.channel,
			enabled: input.enabled,
		})
		.onConflictDoUpdate({
			target: [
				notificationPreferences.userId,
				notificationPreferences.eventName,
				notificationPreferences.channel,
			],
			set: { enabled: input.enabled, updatedAt: new Date() },
		});
	return listNotificationPreferences(database, input.userId);
}

export type TemplateView = {
	id: string;
	eventName: NotificationEvent;
	channel: NotificationChannel;
	locale: "rw" | "en";
	title: string;
	body: string;
};

export async function listNotificationTemplates(
	database: Pick<Database, "select">,
): Promise<TemplateView[]> {
	const rows = await database
		.select({
			id: notificationTemplates.id,
			eventName: notificationTemplates.eventName,
			channel: notificationTemplates.channel,
			locale: notificationTemplates.locale,
			title: notificationTemplates.title,
			body: notificationTemplates.body,
		})
		.from(notificationTemplates)
		.orderBy(
			notificationTemplates.eventName,
			notificationTemplates.channel,
			notificationTemplates.locale,
		);
	return rows.flatMap((row) => {
		if (
			!isNotificationEvent(row.eventName) ||
			!isNotificationChannel(row.channel) ||
			!isNotificationLocale(row.locale)
		) {
			return [];
		}
		return [
			{
				id: row.id,
				eventName: row.eventName,
				channel: row.channel,
				locale: row.locale,
				title: row.title,
				body: row.body,
			},
		];
	});
}

export async function updateNotificationTemplate(
	database: InboxDb,
	input: {
		id: string;
		actorId: number;
		title: string;
		body: string;
		ip: string;
	},
): Promise<TemplateView> {
	const title = input.title.trim();
	const body = input.body.trim();
	if (!title || title.length > 120) {
		throw errors.badRequest("Write a short title.", { reason: "title" });
	}
	if (!body || body.length > 500) {
		throw errors.badRequest("Write the template.", { reason: "body" });
	}
	const rendered = renderTemplate(body, { points: "1", message: "note" });
	if (!rendered.trim()) {
		throw errors.badRequest("Write the template.", { reason: "body" });
	}
	const [updated] = await database
		.update(notificationTemplates)
		.set({
			title,
			body,
			updatedByUserId: input.actorId,
			updatedAt: new Date(),
		})
		.where(eq(notificationTemplates.id, input.id))
		.returning({
			id: notificationTemplates.id,
			eventName: notificationTemplates.eventName,
			channel: notificationTemplates.channel,
			locale: notificationTemplates.locale,
			title: notificationTemplates.title,
			body: notificationTemplates.body,
		});
	if (
		!updated ||
		!isNotificationEvent(updated.eventName) ||
		!isNotificationChannel(updated.channel) ||
		!isNotificationLocale(updated.locale)
	) {
		throw errors.notFound("That template was not found.");
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "notification.template_updated",
		targetType: "notification_template",
		targetId: updated.id,
		ipAddress: input.ip,
		metadata: { eventName: updated.eventName, channel: updated.channel },
	});
	return {
		id: updated.id,
		eventName: updated.eventName,
		channel: updated.channel,
		locale: updated.locale,
		title: updated.title,
		body: updated.body,
	};
}
