import { asc, eq } from "drizzle-orm";
import type { Database } from "../../db";
import { feedbackSnippets } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";

const BODY_LIMIT = 280;

export type FeedbackLocale = "rw" | "en";

export type FeedbackSnippet = {
	id: string;
	locale: FeedbackLocale;
	body: string;
};

type FeedbackDb = Pick<Database, "insert" | "select" | "update">;

export function isFeedbackLocale(value: string): value is FeedbackLocale {
	switch (value) {
		case "rw":
		case "en":
			return true;
		default:
			return false;
	}
}

function cleanBody(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw errors.badRequest("Write the line.", { reason: "body" });
	}
	if (trimmed.length > BODY_LIMIT) {
		throw errors.badRequest("That line is too long.", { reason: "body" });
	}
	return trimmed;
}

function cleanLocale(value: string): FeedbackLocale {
	if (!isFeedbackLocale(value)) {
		throw errors.badRequest("Choose Kinyarwanda or English.", {
			reason: "locale",
		});
	}
	return value;
}

/** Lines a trainer can insert, then change, in either language. */
export async function listFeedbackSnippets(
	database: Pick<Database, "select">,
): Promise<{ items: FeedbackSnippet[] }> {
	const rows = await database
		.select({
			id: feedbackSnippets.id,
			locale: feedbackSnippets.locale,
			body: feedbackSnippets.body,
		})
		.from(feedbackSnippets)
		.orderBy(asc(feedbackSnippets.locale), asc(feedbackSnippets.createdAt));
	return {
		items: rows.flatMap((row) => {
			if (!isFeedbackLocale(row.locale)) return [];
			return [{ id: row.id, locale: row.locale, body: row.body }];
		}),
	};
}

export async function createFeedbackSnippet(
	database: FeedbackDb,
	input: { actorId: number; locale: string; body: string; ip: string },
): Promise<FeedbackSnippet> {
	const locale = cleanLocale(input.locale);
	const body = cleanBody(input.body);
	const [created] = await database
		.insert(feedbackSnippets)
		.values({ locale, body, createdByUserId: input.actorId })
		.returning({ id: feedbackSnippets.id });
	if (!created) throw errors.internal("The line could not be stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "feedback_snippet.created",
		targetType: "feedback_snippet",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: { locale },
	});
	return { id: created.id, locale, body };
}

export async function updateFeedbackSnippet(
	database: FeedbackDb,
	input: {
		actorId: number;
		id: string;
		locale: string;
		body: string;
		ip: string;
	},
): Promise<FeedbackSnippet> {
	const locale = cleanLocale(input.locale);
	const body = cleanBody(input.body);
	const [updated] = await database
		.update(feedbackSnippets)
		.set({ locale, body, updatedAt: new Date() })
		.where(eq(feedbackSnippets.id, input.id))
		.returning({ id: feedbackSnippets.id });
	if (!updated) throw errors.notFound("That line was not found.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "feedback_snippet.updated",
		targetType: "feedback_snippet",
		targetId: updated.id,
		ipAddress: input.ip,
		metadata: { locale },
	});
	return { id: updated.id, locale, body };
}
