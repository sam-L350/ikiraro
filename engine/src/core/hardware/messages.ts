import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import type { Database } from "../../db";
import {
	mentorBlocks,
	mentorContactShares,
	mentorMessageReports,
	mentorMessages,
	mentorOptIns,
	mentorRequests,
	mentorSafeguarding,
	mentors,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { isUnder18 } from "../identity/age";

type MessageDb = Database;

export type MessageMatch = {
	id: string;
	otherName: string;
	skill: string;
};

export type ThreadMessage = {
	id: string;
	body: string;
	mine: boolean;
};

export type Thread = {
	id: string;
	otherName: string;
	blocked: boolean;
	needsCheck: boolean;
	sharedByMe: boolean;
	contact: { phone: string | null; email: string } | null;
	messages: ThreadMessage[];
};

type MatchRow = {
	id: string;
	learnerUserId: number;
	mentorUserId: number;
	learnerName: string | null;
	mentorName: string | null;
	learnerBirth: string | null;
	learnerPhone: string | null;
	learnerEmail: string;
	mentorPhone: string | null;
	mentorEmail: string;
};

function clean(
	value: string,
	max: number,
	reason: string,
	message: string,
): string {
	const text = value.trim();
	if (text.length < 1 || text.length > max) {
		throw errors.badRequest(message, { reason });
	}
	return text;
}

function isUnique(error: unknown): boolean {
	if (typeof error === "object" && error !== null && "code" in error) {
		if (error.code === "23505") return true;
	}
	if (error instanceof Error && error.cause) return isUnique(error.cause);
	return false;
}

async function acceptedMatch(
	database: MessageDb,
	requestId: string,
	userId: number,
): Promise<MatchRow> {
	const [row] = await database
		.select({
			id: mentorRequests.id,
			status: mentorRequests.status,
			learnerUserId: mentorRequests.learnerUserId,
			mentorUserId: mentors.userId,
			learnerName: users.name,
			learnerBirth: users.dateOfBirth,
			learnerPhone: users.phone,
			learnerEmail: users.email,
		})
		.from(mentorRequests)
		.innerJoin(mentors, eq(mentors.id, mentorRequests.mentorId))
		.innerJoin(users, eq(users.id, mentorRequests.learnerUserId))
		.where(eq(mentorRequests.id, requestId))
		.limit(1);
	if (row?.status !== "accepted") {
		throw errors.conflict("Messages start after the learner accepts.", {
			reason: "match",
		});
	}
	const [mentor] = await database
		.select({ name: users.name, phone: users.phone, email: users.email })
		.from(users)
		.where(eq(users.id, row.mentorUserId))
		.limit(1);
	if (!mentor) throw errors.notFound("That match is not here.");
	if (userId !== row.learnerUserId && userId !== row.mentorUserId) {
		throw errors.forbidden(
			"This match is between the mentor and the learner.",
			{
				reason: "self",
			},
		);
	}
	return {
		id: row.id,
		learnerUserId: row.learnerUserId,
		mentorUserId: row.mentorUserId,
		learnerName: row.learnerName,
		mentorName: mentor.name,
		learnerBirth: row.learnerBirth,
		learnerPhone: row.learnerPhone,
		learnerEmail: row.learnerEmail,
		mentorPhone: mentor.phone,
		mentorEmail: mentor.email,
	};
}

async function blocked(
	database: MessageDb,
	requestId: string,
): Promise<boolean> {
	const [row] = await database
		.select({ id: mentorBlocks.id })
		.from(mentorBlocks)
		.where(eq(mentorBlocks.requestId, requestId))
		.limit(1);
	return Boolean(row);
}

async function needsSafeguarding(
	database: MessageDb,
	match: MatchRow,
): Promise<boolean> {
	if (!match.learnerBirth || !isUnder18(match.learnerBirth)) return false;
	const [check] = await database
		.select({ id: mentorSafeguarding.id })
		.from(mentorSafeguarding)
		.where(eq(mentorSafeguarding.mentorUserId, match.mentorUserId))
		.limit(1);
	return !check;
}

/** Accepted matches this person can write in. */
export async function listMessageMatches(
	database: MessageDb,
	userId: number,
): Promise<MessageMatch[]> {
	const rows = await database
		.select({
			id: mentorRequests.id,
			learnerUserId: mentorRequests.learnerUserId,
			mentorUserId: mentors.userId,
			learnerName: users.name,
			skill: mentorOptIns.skill,
		})
		.from(mentorRequests)
		.innerJoin(mentors, eq(mentors.id, mentorRequests.mentorId))
		.innerJoin(users, eq(users.id, mentorRequests.learnerUserId))
		.innerJoin(mentorOptIns, eq(mentorOptIns.id, mentorRequests.optInId))
		.where(
			and(
				eq(mentorRequests.status, "accepted"),
				or(
					eq(mentorRequests.learnerUserId, userId),
					eq(mentors.userId, userId),
				),
			),
		)
		.orderBy(desc(mentorRequests.createdAt));
	const mentorIds = [...new Set(rows.map((row) => row.mentorUserId))];
	const names = new Map<number, string>();
	if (mentorIds.length > 0) {
		const people = await database
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(inArray(users.id, mentorIds));
		for (const person of people) names.set(person.id, person.name ?? "");
	}
	return rows.map((row) => ({
		id: row.id,
		otherName:
			row.learnerUserId === userId
				? (names.get(row.mentorUserId) ?? "")
				: (row.learnerName ?? ""),
		skill: row.skill,
	}));
}

export async function readThread(
	database: MessageDb,
	input: { userId: number; requestId: string },
): Promise<Thread> {
	const match = await acceptedMatch(database, input.requestId, input.userId);
	const messages = await database
		.select({
			id: mentorMessages.id,
			body: mentorMessages.body,
			senderUserId: mentorMessages.senderUserId,
		})
		.from(mentorMessages)
		.where(eq(mentorMessages.requestId, match.id))
		.orderBy(asc(mentorMessages.createdAt));
	const shares = await database
		.select({ userId: mentorContactShares.userId })
		.from(mentorContactShares)
		.where(eq(mentorContactShares.requestId, match.id));
	const sharedIds = new Set(shares.map((row) => row.userId));
	const both =
		sharedIds.has(match.learnerUserId) && sharedIds.has(match.mentorUserId);
	const viewerIsLearner = input.userId === match.learnerUserId;
	const contact = both
		? viewerIsLearner
			? { phone: match.mentorPhone, email: match.mentorEmail }
			: { phone: match.learnerPhone, email: match.learnerEmail }
		: null;
	return {
		id: match.id,
		otherName: viewerIsLearner
			? (match.mentorName ?? "")
			: (match.learnerName ?? ""),
		blocked: await blocked(database, match.id),
		needsCheck: await needsSafeguarding(database, match),
		sharedByMe: sharedIds.has(input.userId),
		contact,
		messages: messages.map((row) => ({
			id: row.id,
			body: row.body,
			mine: row.senderUserId === input.userId,
		})),
	};
}

/** A message on an accepted match. A learner under 18 needs the extra check first. */
export async function sendMentorMessage(
	database: MessageDb,
	input: { userId: number; requestId: string; body: string; ip?: string },
): Promise<{ id: string }> {
	const body = clean(input.body, 2000, "body", "Write the message.");
	const match = await acceptedMatch(database, input.requestId, input.userId);
	if (await blocked(database, match.id)) {
		throw errors.conflict("This match is blocked.", { reason: "block" });
	}
	if (await needsSafeguarding(database, match)) {
		throw errors.conflict(
			"A mentor needs an extra check before contacting a learner under 18.",
			{ reason: "safeguarding" },
		);
	}
	const [created] = await database
		.insert(mentorMessages)
		.values({ requestId: match.id, senderUserId: input.userId, body })
		.returning({ id: mentorMessages.id });
	if (!created) throw errors.internal("The message was not stored.");
	await writeAudit(database, {
		actorId: input.userId,
		action: "mentor.message_sent",
		ipAddress: input.ip,
	});
	return created;
}

export async function reportMentorMessage(
	database: MessageDb,
	input: { userId: number; messageId: string; note: string; ip?: string },
): Promise<{ id: string }> {
	const note = clean(input.note, 400, "note", "Write what should be reviewed.");
	const [message] = await database
		.select({ id: mentorMessages.id, requestId: mentorMessages.requestId })
		.from(mentorMessages)
		.where(eq(mentorMessages.id, input.messageId))
		.limit(1);
	if (!message) throw errors.notFound("That message is not here.");
	await acceptedMatch(database, message.requestId, input.userId);
	const [created] = await database
		.insert(mentorMessageReports)
		.values({
			messageId: message.id,
			reporterUserId: input.userId,
			note,
		})
		.returning({ id: mentorMessageReports.id });
	if (!created) throw errors.internal("The report was not stored.");
	await writeAudit(database, {
		actorId: input.userId,
		action: "mentor.message_reported",
		ipAddress: input.ip,
	});
	return created;
}

export async function blockMentorMatch(
	database: MessageDb,
	input: { userId: number; requestId: string; ip?: string },
): Promise<{ id: string }> {
	const match = await acceptedMatch(database, input.requestId, input.userId);
	try {
		const [created] = await database
			.insert(mentorBlocks)
			.values({ requestId: match.id, blockerUserId: input.userId })
			.returning({ id: mentorBlocks.id });
		if (!created) throw errors.internal("The block was not stored.");
		await writeAudit(database, {
			actorId: input.userId,
			action: "mentor.blocked",
			ipAddress: input.ip,
		});
		return created;
	} catch (error) {
		if (isUnique(error)) {
			throw errors.conflict("This match is already blocked.", {
				reason: "block",
			});
		}
		throw error;
	}
}

/** One person agrees. The phone and email stay hidden until the other agrees too. */
export async function shareMentorContact(
	database: MessageDb,
	input: { userId: number; requestId: string; ip?: string },
): Promise<{ id: string }> {
	const match = await acceptedMatch(database, input.requestId, input.userId);
	if (await needsSafeguarding(database, match)) {
		throw errors.conflict(
			"A mentor needs an extra check before contacting a learner under 18.",
			{ reason: "safeguarding" },
		);
	}
	try {
		const [created] = await database
			.insert(mentorContactShares)
			.values({ requestId: match.id, userId: input.userId })
			.returning({ id: mentorContactShares.id });
		if (!created) throw errors.internal("The agreement was not stored.");
		await writeAudit(database, {
			actorId: input.userId,
			action: "mentor.contact_shared",
			ipAddress: input.ip,
		});
		return created;
	} catch (error) {
		if (isUnique(error)) {
			throw errors.conflict("You already agreed to share contact details.", {
				reason: "duplicate",
			});
		}
		throw error;
	}
}

/** An admin writes the extra check for one approved mentor. */
export async function recordSafeguarding(
	database: MessageDb,
	input: { actorId: number; mentorUserId: number; note: string; ip?: string },
): Promise<{ id: string }> {
	const note = clean(input.note, 400, "note", "Write what you checked.");
	if (input.actorId === input.mentorUserId) {
		throw errors.forbidden("Someone else records this check.", {
			reason: "self",
		});
	}
	const [mentor] = await database
		.select({ id: mentors.id })
		.from(mentors)
		.where(
			and(
				eq(mentors.userId, input.mentorUserId),
				eq(mentors.kind, "mentor"),
				eq(mentors.status, "approved"),
			),
		)
		.limit(1);
	if (!mentor) throw errors.notFound("That mentor is not approved.");
	try {
		const [created] = await database
			.insert(mentorSafeguarding)
			.values({
				mentorUserId: input.mentorUserId,
				note,
				checkedByUserId: input.actorId,
			})
			.returning({ id: mentorSafeguarding.id });
		if (!created) throw errors.internal("The check was not stored.");
		await writeAudit(database, {
			actorId: input.actorId,
			action: "mentor.safeguarding_recorded",
			ipAddress: input.ip,
		});
		return created;
	} catch (error) {
		if (isUnique(error)) {
			throw errors.conflict("This mentor already has the extra check.", {
				reason: "duplicate",
			});
		}
		throw error;
	}
}

export async function listSafeguardingMentors(
	database: MessageDb,
): Promise<{ userId: number; name: string; checked: boolean }[]> {
	const rows = await database
		.select({ userId: mentors.userId, name: users.name })
		.from(mentors)
		.innerJoin(users, eq(users.id, mentors.userId))
		.where(and(eq(mentors.kind, "mentor"), eq(mentors.status, "approved")))
		.orderBy(users.name);
	const checks = await database
		.select({ userId: mentorSafeguarding.mentorUserId })
		.from(mentorSafeguarding);
	const checked = new Set(checks.map((row) => row.userId));
	return rows.map((row) => ({
		userId: row.userId,
		name: row.name ?? "",
		checked: checked.has(row.userId),
	}));
}

/** The latest retained messages and reports. Older rows stay stored. */
export async function listMessageReview(database: MessageDb): Promise<{
	messages: { id: string; senderName: string; body: string }[];
	reports: {
		id: string;
		messageId: string;
		reporterName: string;
		note: string;
	}[];
}> {
	const messages = await database
		.select({
			id: mentorMessages.id,
			senderName: users.name,
			body: mentorMessages.body,
		})
		.from(mentorMessages)
		.innerJoin(users, eq(users.id, mentorMessages.senderUserId))
		.orderBy(desc(mentorMessages.createdAt))
		.limit(100);
	const reports = await database
		.select({
			id: mentorMessageReports.id,
			messageId: mentorMessageReports.messageId,
			reporterName: users.name,
			note: mentorMessageReports.note,
		})
		.from(mentorMessageReports)
		.innerJoin(users, eq(users.id, mentorMessageReports.reporterUserId))
		.orderBy(desc(mentorMessageReports.createdAt))
		.limit(100);
	return {
		messages: messages.map((row) => ({
			id: row.id,
			senderName: row.senderName ?? "",
			body: row.body,
		})),
		reports: reports.map((row) => ({
			id: row.id,
			messageId: row.messageId,
			reporterName: row.reporterName ?? "",
			note: row.note,
		})),
	};
}
