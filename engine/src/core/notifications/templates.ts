import { and, eq } from "drizzle-orm";
import type { Database } from "../../db";
import { notificationTemplates } from "../../db/schema";

export const NOTIFICATION_EVENTS = [
	"submission.created",
	"submission.approved",
	"submission.needs_revision",
	"submission.rejected",
	"badge.awarded",
	"points.adjusted",
	"grant.decided",
	"follow_up.due",
	"learner.stalled",
	"announcement.posted",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_CHANNELS = ["in_app", "sms", "email"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_LOCALES = ["rw", "en"] as const;

export type NotificationLocale = (typeof NOTIFICATION_LOCALES)[number];

type TemplateCopy = { title: string; body: string };

const COPY: Record<
	NotificationEvent,
	Record<NotificationLocale, TemplateCopy>
> = {
	"submission.created": {
		en: {
			title: "Evidence received",
			body: "Evidence was received and is waiting for review.",
		},
		rw: {
			title: "Ibyemezo byakiriwe",
			body: "Ibyemezo byakiriwe kandi bitegereje isuzuma.",
		},
	},
	"submission.approved": {
		en: {
			title: "Evidence approved",
			body: "Your evidence was approved.",
		},
		rw: {
			title: "Ibyemezo byemewe",
			body: "Ibyemezo byawe byemewe.",
		},
	},
	"submission.needs_revision": {
		en: {
			title: "Send this again",
			body: "A trainer asked you to revise this evidence.",
		},
		rw: {
			title: "Ongera wohereze",
			body: "Umwarimu yasabye ko wongera wohereza ibi byemezo.",
		},
	},
	"submission.rejected": {
		en: {
			title: "Evidence was not approved",
			body: "This evidence was not approved.",
		},
		rw: {
			title: "Ibyemezo ntibyemewe",
			body: "Ibi byemezo ntibyemewe.",
		},
	},
	"badge.awarded": {
		en: {
			title: "You earned a badge",
			body: "A badge is now on your passport.",
		},
		rw: {
			title: "Waronse ikirango",
			body: "Ikirango kiri kuri pasiporo yawe.",
		},
	},
	"points.adjusted": {
		en: {
			title: "Your points changed",
			body: "Your points changed by {points}.",
		},
		rw: {
			title: "Amanota yawe yahindutse",
			body: "Amanota yawe yahindutse ku {points}.",
		},
	},
	"grant.decided": {
		en: {
			title: "Grant decision",
			body: "A decision was recorded on your grant.",
		},
		rw: {
			title: "Icyemezo cy'inkunga",
			body: "Icyemezo cyanditswe ku nkunga yawe.",
		},
	},
	"follow_up.due": {
		en: {
			title: "Follow-up due",
			body: "A follow-up is due.",
		},
		rw: {
			title: "Ikurikiranwa rirageze",
			body: "Igihe cyo gukurikirana cyageze.",
		},
	},
	"learner.stalled": {
		en: {
			title: "One task left",
			body: "You are one task from your badge.",
		},
		rw: {
			title: "Igikorwa kimwe gisigaye",
			body: "Usigaye igikorwa kimwe kugira ngo ubone ikirango.",
		},
	},
	"announcement.posted": {
		en: { title: "Announcement", body: "{message}" },
		rw: { title: "Itangazo", body: "{message}" },
	},
};

export function isNotificationEvent(value: string): value is NotificationEvent {
	switch (value) {
		case "submission.created":
		case "submission.approved":
		case "submission.needs_revision":
		case "submission.rejected":
		case "badge.awarded":
		case "points.adjusted":
		case "grant.decided":
		case "follow_up.due":
		case "learner.stalled":
		case "announcement.posted":
			return true;
		default:
			return false;
	}
}

export function isNotificationChannel(
	value: string,
): value is NotificationChannel {
	switch (value) {
		case "in_app":
		case "sms":
		case "email":
			return true;
		default:
			return false;
	}
}

export function isNotificationLocale(
	value: string,
): value is NotificationLocale {
	switch (value) {
		case "rw":
		case "en":
			return true;
		default:
			return false;
	}
}

/** In-app and SMS start on. Email stays off until the person asks for it. */
export function defaultChannelEnabled(channel: NotificationChannel): boolean {
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

export function renderTemplate(
	template: string,
	vars: Readonly<Record<string, string>>,
): string {
	return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
		return vars[name] ?? "";
	});
}

/** Insert any missing default sentence. An admin edit is left alone. */
export async function ensureDefaultTemplates(
	database: Pick<Database, "insert">,
): Promise<void> {
	const rows = NOTIFICATION_EVENTS.flatMap((eventName) =>
		NOTIFICATION_CHANNELS.flatMap((channel) =>
			NOTIFICATION_LOCALES.map((locale) => ({
				eventName,
				channel,
				locale,
				title: COPY[eventName][locale].title,
				body: COPY[eventName][locale].body,
			})),
		),
	);
	await database
		.insert(notificationTemplates)
		.values(rows)
		.onConflictDoNothing({
			target: [
				notificationTemplates.eventName,
				notificationTemplates.channel,
				notificationTemplates.locale,
			],
		});
}

export async function readTemplate(
	database: Pick<Database, "select">,
	input: {
		eventName: NotificationEvent;
		channel: NotificationChannel;
		locale: NotificationLocale;
	},
): Promise<{ title: string; body: string } | null> {
	const rows = await database
		.select({
			title: notificationTemplates.title,
			body: notificationTemplates.body,
			locale: notificationTemplates.locale,
		})
		.from(notificationTemplates)
		.where(
			and(
				eq(notificationTemplates.eventName, input.eventName),
				eq(notificationTemplates.channel, input.channel),
			),
		);
	const match =
		rows.find((item) => item.locale === input.locale) ??
		rows.find((item) => item.locale === "en");
	if (!match) return null;
	return { title: match.title, body: match.body };
}
