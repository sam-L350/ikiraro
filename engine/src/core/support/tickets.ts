import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db";
import {
	mediaObjects,
	roles,
	supportResponses,
	supportTickets,
	userRoles,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";

type TicketDb = Pick<Database, "insert" | "select" | "update">;

export type TicketKind = "technical" | "content" | "conduct";

export type TicketView = {
	id: string;
	kind: TicketKind;
	body: string;
	status: "open" | "answered" | "closed";
	mine: boolean;
	ownerRole: "platform_admin" | "content_reviewer";
	ownerName: string | null;
	createdAt: string;
	minutes: number | null;
};

const BODY_LIMIT = 4_000;
const NOTE_LIMIT = 2_000;

function isKind(value: string): value is TicketKind {
	switch (value) {
		case "technical":
		case "content":
		case "conduct":
			return true;
		default:
			return false;
	}
}

function isStatus(value: string): value is TicketView["status"] {
	switch (value) {
		case "open":
		case "answered":
		case "closed":
			return true;
		default:
			return false;
	}
}

function ownerRole(kind: TicketKind): TicketView["ownerRole"] {
	switch (kind) {
		case "content":
			return "content_reviewer";
		case "technical":
		case "conduct":
			return "platform_admin";
		default: {
			const unreachable: never = kind;
			return unreachable;
		}
	}
}

function clean(
	value: string,
	limit: number,
	empty: string,
	reason: string,
): string {
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > limit) {
		throw errors.badRequest(empty, { reason });
	}
	return trimmed;
}

async function assignments(
	database: Pick<Database, "select">,
	userId: number,
): Promise<{ admin: boolean; reviewer: boolean }> {
	const rows = await database
		.select({ code: roles.code })
		.from(userRoles)
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(and(eq(userRoles.userId, userId), isNull(userRoles.suspendedAt)));
	return {
		admin: rows.some((row) => row.code === "platform_admin"),
		reviewer: rows.some((row) => row.code === "content_reviewer"),
	};
}

function canAnswer(
	kind: TicketKind,
	rolesHeld: { admin: boolean; reviewer: boolean },
): boolean {
	if (rolesHeld.admin) return true;
	return kind === "content" && rolesHeld.reviewer;
}

function minutesBetween(start: Date, end: Date | null): number | null {
	if (!end) return null;
	return Math.floor((end.getTime() - start.getTime()) / 60_000);
}

/** File a problem. Conduct goes to a platform admin, outside the center. */
export async function fileTicket(
	database: TicketDb,
	input: {
		actorId: number;
		kind: string;
		body: string;
		mediaId?: string;
		ip: string;
	},
): Promise<{ id: string }> {
	if (!isKind(input.kind)) {
		throw errors.badRequest("Choose what this problem is about.", {
			reason: "kind",
		});
	}
	const body = clean(input.body, BODY_LIMIT, "Write the problem.", "body");
	const mediaId = input.mediaId?.trim() ?? "";
	if (mediaId) {
		const [media] = await database
			.select({
				ownerUserId: mediaObjects.ownerUserId,
				contentType: mediaObjects.contentType,
				status: mediaObjects.status,
			})
			.from(mediaObjects)
			.where(eq(mediaObjects.id, mediaId))
			.limit(1);
		if (!media || media.ownerUserId !== input.actorId) {
			throw errors.forbidden("That file is not yours.", { reason: "scope" });
		}
		if (media.status !== "ready") {
			throw errors.conflict("The photo is not ready.", { reason: "photo" });
		}
		if (!media.contentType.startsWith("image/")) {
			throw errors.badRequest("Choose a photo.", { reason: "media" });
		}
	}
	const [created] = await database
		.insert(supportTickets)
		.values({
			reporterUserId: input.actorId,
			kind: input.kind,
			body,
			mediaId: mediaId === "" ? null : mediaId,
		})
		.returning({ id: supportTickets.id });
	if (!created) throw errors.internal("The report could not be stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "support_ticket.filed",
		targetType: "support_ticket",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: { kind: input.kind },
	});
	return { id: created.id };
}

type TicketRow = {
	id: string;
	kind: string;
	body: string;
	status: string;
	reporterUserId: number;
	ownerName: string | null;
	createdAt: Date;
	answeredAt: Date | null;
};

function toView(row: TicketRow, actorId: number): TicketView | null {
	if (!isKind(row.kind) || !isStatus(row.status)) return null;
	const name = row.ownerName?.trim();
	return {
		id: row.id,
		kind: row.kind,
		body: row.body,
		status: row.status,
		mine: row.reporterUserId === actorId,
		ownerRole: ownerRole(row.kind),
		ownerName: name ? name : null,
		createdAt: row.createdAt.toISOString(),
		minutes: minutesBetween(row.createdAt, row.answeredAt),
	};
}

/** Reports this person filed, and the ones they are allowed to answer. */
export async function listTickets(
	database: Pick<Database, "select">,
	actorId: number,
): Promise<{ mine: TicketView[]; queue: TicketView[]; canAnswer: boolean }> {
	const held = await assignments(database, actorId);
	const rows = await database
		.select({
			id: supportTickets.id,
			kind: supportTickets.kind,
			body: supportTickets.body,
			status: supportTickets.status,
			reporterUserId: supportTickets.reporterUserId,
			ownerName: users.name,
			createdAt: supportTickets.createdAt,
			answeredAt: supportTickets.answeredAt,
		})
		.from(supportTickets)
		.leftJoin(users, eq(users.id, supportTickets.ownerUserId))
		.orderBy(desc(supportTickets.createdAt))
		.limit(100);
	const mine: TicketView[] = [];
	const queue: TicketView[] = [];
	for (const row of rows) {
		const view = toView(row, actorId);
		if (!view) continue;
		if (row.reporterUserId === actorId) mine.push(view);
		if (canAnswer(view.kind, held) && row.reporterUserId !== actorId) {
			queue.push(view);
		}
	}
	return { mine, queue, canAnswer: held.admin || held.reviewer };
}

async function loadOpen(
	database: Pick<Database, "select">,
	id: string,
): Promise<TicketRow & { status: TicketView["status"]; kind: TicketKind }> {
	const [row] = await database
		.select({
			id: supportTickets.id,
			kind: supportTickets.kind,
			body: supportTickets.body,
			status: supportTickets.status,
			reporterUserId: supportTickets.reporterUserId,
			ownerName: users.name,
			createdAt: supportTickets.createdAt,
			answeredAt: supportTickets.answeredAt,
		})
		.from(supportTickets)
		.leftJoin(users, eq(users.id, supportTickets.ownerUserId))
		.where(eq(supportTickets.id, id))
		.limit(1);
	if (!row || !isKind(row.kind) || !isStatus(row.status)) {
		throw errors.notFound("That report was not found.");
	}
	if (row.status === "closed") {
		throw errors.conflict("This report is already closed.", {
			reason: "closed",
		});
	}
	return { ...row, kind: row.kind, status: row.status };
}

async function assertOwner(
	database: Pick<Database, "select">,
	actorId: number,
	ticket: { reporterUserId: number; kind: TicketKind },
): Promise<void> {
	if (ticket.reporterUserId === actorId) {
		throw errors.forbidden("Someone else answers this report.", {
			reason: "self",
		});
	}
	const held = await assignments(database, actorId);
	if (!canAnswer(ticket.kind, held)) {
		throw errors.forbidden(
			ticket.kind === "content"
				? "A content reviewer answers this report."
				: "A platform admin answers this report.",
			{ reason: "scope" },
		);
	}
}

/** The first answer sets the response time. Later notes keep that time. */
export async function answerTicket(
	database: TicketDb,
	input: { actorId: number; ticketId: string; note: string; ip: string },
): Promise<{ id: string; minutes: number }> {
	const note = clean(input.note, NOTE_LIMIT, "Write the answer.", "note");
	const ticket = await loadOpen(database, input.ticketId);
	await assertOwner(database, input.actorId, ticket);
	const answeredAt = ticket.answeredAt ?? new Date();
	await database.insert(supportResponses).values({
		ticketId: ticket.id,
		authorUserId: input.actorId,
		body: note,
	});
	if (ticket.status === "open") {
		await database
			.update(supportTickets)
			.set({
				status: "answered",
				ownerUserId: input.actorId,
				answeredAt,
			})
			.where(
				and(
					eq(supportTickets.id, ticket.id),
					eq(supportTickets.status, "open"),
				),
			);
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "support_ticket.answered",
		targetType: "support_ticket",
		targetId: ticket.id,
		ipAddress: input.ip,
		metadata: { kind: ticket.kind },
	});
	const elapsed = minutesBetween(ticket.createdAt, answeredAt);
	return { id: ticket.id, minutes: elapsed ?? 0 };
}

/** Close the report. The first answer time stays if one was recorded. */
export async function closeTicket(
	database: TicketDb,
	input: { actorId: number; ticketId: string; note: string; ip: string },
): Promise<{ id: string }> {
	const note = clean(
		input.note,
		NOTE_LIMIT,
		"Write why this is closed.",
		"note",
	);
	const ticket = await loadOpen(database, input.ticketId);
	await assertOwner(database, input.actorId, ticket);
	await database.insert(supportResponses).values({
		ticketId: ticket.id,
		authorUserId: input.actorId,
		body: note,
	});
	const [updated] = await database
		.update(supportTickets)
		.set({
			status: "closed",
			closedAt: new Date(),
			...(ticket.status === "open" ? { ownerUserId: input.actorId } : {}),
		})
		.where(eq(supportTickets.id, ticket.id))
		.returning({ id: supportTickets.id });
	if (!updated)
		throw errors.conflict("This report is already closed.", {
			reason: "closed",
		});
	await writeAudit(database, {
		actorId: input.actorId,
		action: "support_ticket.closed",
		targetType: "support_ticket",
		targetId: ticket.id,
		ipAddress: input.ip,
		metadata: { kind: ticket.kind },
	});
	return { id: ticket.id };
}
