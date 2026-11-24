import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db";
import { partnerWebhooks, webhookDeliveries } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { ROLE_PERMISSIONS } from "../authz/catalog";
import type { Assignment } from "../authz/decide";
import { logger } from "../logger";

type WebhookDb = Pick<Database, "insert" | "select" | "update">;

export const PARTNER_EVENTS = ["credential.awarded", "grant.decided"] as const;

export type PartnerEvent = (typeof PARTNER_EVENTS)[number];

export type WebhookRow = {
	id: string;
	url: string;
	event: PartnerEvent;
	createdAt: string;
};

const URL_LIMIT = 200;
const SEND_LIMIT = 10;
const ATTEMPT_LIMIT = 3;

function isPartnerEvent(value: string): value is PartnerEvent {
	switch (value) {
		case "credential.awarded":
		case "grant.decided":
			return true;
		default:
			return false;
	}
}

function requireAdmin(assignments: readonly Assignment[]): void {
	const allowed = assignments.some((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes("admin.manage"),
	);
	if (!allowed) {
		throw errors.forbidden("An administrator stores a partner address.", {
			reason: "webhook",
		});
	}
}

function requireUrl(value: string): string {
	const url = value.trim();
	if (url.length < 8 || url.length > URL_LIMIT) {
		throw errors.badRequest("Write the partner address.", {
			reason: "webhook",
		});
	}
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw errors.badRequest("Write the partner address.", {
			reason: "webhook",
		});
	}
	if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
		throw errors.badRequest("Write the partner address.", {
			reason: "webhook",
		});
	}
	return url;
}

function requireEvent(value: string): PartnerEvent {
	if (!isPartnerEvent(value)) {
		throw errors.badRequest("Choose what to send.", { reason: "webhook" });
	}
	return value;
}

/** The notice a partner receives. The address, the email, and the token stay out. */
export function partnerPayload(input: { event: string; targetId: string }): {
	event: string;
	targetId: string;
} {
	return { event: input.event, targetId: input.targetId };
}

/** Addresses an administrator has stored. */
export async function readPartnerWebhooks(
	database: Pick<Database, "select">,
	assignments: readonly Assignment[],
): Promise<{ hooks: WebhookRow[] }> {
	requireAdmin(assignments);
	const rows = await database
		.select({
			id: partnerWebhooks.id,
			url: partnerWebhooks.url,
			event: partnerWebhooks.event,
			createdAt: partnerWebhooks.createdAt,
		})
		.from(partnerWebhooks)
		.orderBy(asc(partnerWebhooks.createdAt));
	const hooks: WebhookRow[] = [];
	for (const row of rows) {
		if (!isPartnerEvent(row.event)) continue;
		hooks.push({
			id: row.id,
			url: row.url,
			event: row.event,
			createdAt: row.createdAt.toISOString(),
		});
	}
	return { hooks };
}

/** Store one https address for one event. */
export async function createPartnerWebhook(
	database: Pick<Database, "insert" | "select">,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		url: string;
		event: string;
		ip: string;
	},
): Promise<WebhookRow> {
	requireAdmin(input.assignments);
	const url = requireUrl(input.url);
	const event = requireEvent(input.event);
	const [existing] = await database
		.select({ id: partnerWebhooks.id })
		.from(partnerWebhooks)
		.where(and(eq(partnerWebhooks.url, url), eq(partnerWebhooks.event, event)))
		.limit(1);
	if (existing) {
		throw errors.conflict("This address is already stored.", {
			reason: "webhook",
		});
	}
	const [created] = await database
		.insert(partnerWebhooks)
		.values({
			url,
			event,
			createdByUserId: input.actorId,
		})
		.returning({
			id: partnerWebhooks.id,
			url: partnerWebhooks.url,
			event: partnerWebhooks.event,
			createdAt: partnerWebhooks.createdAt,
		});
	if (!created || !isPartnerEvent(created.event)) {
		throw errors.internal("The address was not stored.");
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "webhook.stored",
		targetType: "partner_webhook",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: { event },
	});
	return {
		id: created.id,
		url: created.url,
		event: created.event,
		createdAt: created.createdAt.toISOString(),
	};
}

/** Queue a notice for every address listening to this event. */
export async function notifyPartners(
	database: Pick<Database, "insert" | "select">,
	input: { event: PartnerEvent; targetId: string },
): Promise<void> {
	const targetId = input.targetId.trim();
	if (!targetId) return;
	const hooks = await database
		.select({ id: partnerWebhooks.id })
		.from(partnerWebhooks)
		.where(eq(partnerWebhooks.event, input.event));
	if (hooks.length === 0) return;
	await database.insert(webhookDeliveries).values(
		hooks.map((hook) => ({
			webhookId: hook.id,
			event: input.event,
			targetId,
		})),
	);
}

/** Send queued notices. A failure is tried again, then left. */
export async function sendDueWebhooks(database: WebhookDb): Promise<void> {
	const rows = await database
		.select({
			id: webhookDeliveries.id,
			event: webhookDeliveries.event,
			targetId: webhookDeliveries.targetId,
			attempts: webhookDeliveries.attempts,
			url: partnerWebhooks.url,
		})
		.from(webhookDeliveries)
		.innerJoin(
			partnerWebhooks,
			eq(partnerWebhooks.id, webhookDeliveries.webhookId),
		)
		.where(isNull(webhookDeliveries.sentAt))
		.limit(SEND_LIMIT);
	for (const row of rows) {
		const next = row.attempts + 1;
		let delivered = false;
		try {
			const response = await fetch(row.url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(
					partnerPayload({ event: row.event, targetId: row.targetId }),
				),
				signal: AbortSignal.timeout(5_000),
			});
			delivered = response.ok;
		} catch (error) {
			logger.error("partner notice failed", { error });
		}
		const stop = delivered || next >= ATTEMPT_LIMIT;
		await database
			.update(webhookDeliveries)
			.set(stop ? { attempts: next, sentAt: new Date() } : { attempts: next })
			.where(eq(webhookDeliveries.id, row.id));
	}
}
