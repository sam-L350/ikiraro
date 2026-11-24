import { and, desc, eq, notExists } from "drizzle-orm";
import type { Database } from "../../db";
import {
	earnedBadges,
	satisfactionPulses,
	submissionVerifications,
	taskSubmissions,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";

type PulseDb = Pick<Database, "insert" | "select">;

const BODY_LIMIT = 280;

export type PulseMoment = "first_badge" | "review";

export type OpenPulse = {
	moment: PulseMoment | null;
	verificationId: string | null;
};

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value,
	);
}

/** The next unanswered moment, or nothing when there is no badge and no review. */
export async function readPulse(
	database: PulseDb,
	userId: number,
): Promise<OpenPulse> {
	const [badge] = await database
		.select({ id: earnedBadges.id })
		.from(earnedBadges)
		.where(
			and(eq(earnedBadges.userId, userId), eq(earnedBadges.entry, "awarded")),
		)
		.limit(1);
	if (badge) {
		const [answered] = await database
			.select({ id: satisfactionPulses.id })
			.from(satisfactionPulses)
			.where(
				and(
					eq(satisfactionPulses.userId, userId),
					eq(satisfactionPulses.moment, "first_badge"),
				),
			)
			.limit(1);
		if (!answered) return { moment: "first_badge", verificationId: null };
	}
	const [review] = await database
		.select({ id: submissionVerifications.id })
		.from(submissionVerifications)
		.innerJoin(
			taskSubmissions,
			eq(taskSubmissions.id, submissionVerifications.submissionId),
		)
		.where(
			and(
				eq(taskSubmissions.ownerUserId, userId),
				notExists(
					database
						.select({ id: satisfactionPulses.id })
						.from(satisfactionPulses)
						.where(
							and(
								eq(satisfactionPulses.userId, userId),
								eq(satisfactionPulses.moment, "review"),
								eq(
									satisfactionPulses.verificationId,
									submissionVerifications.id,
								),
							),
						),
				),
			),
		)
		.orderBy(desc(submissionVerifications.decidedAt))
		.limit(1);
	if (!review) return { moment: null, verificationId: null };
	return { moment: "review", verificationId: review.id };
}

/** One written answer for the moment that is still open. */
export async function answerPulse(
	database: PulseDb,
	input: {
		userId: number;
		moment: string;
		verificationId?: string;
		body: string;
		ip: string;
	},
): Promise<{ id: string }> {
	const body = input.body.trim();
	if (body.length < 1 || body.length > BODY_LIMIT) {
		throw errors.badRequest("Write how it went.", { reason: "pulse" });
	}
	const open = await readPulse(database, input.userId);
	if (!open.moment) {
		throw errors.badRequest("Nothing to answer.", { reason: "pulse" });
	}
	if (input.moment !== open.moment) {
		throw errors.badRequest("Nothing to answer.", { reason: "pulse" });
	}
	const verificationId = input.verificationId?.trim() ?? "";
	if (open.moment === "first_badge") {
		if (verificationId) {
			throw errors.badRequest("Nothing to answer.", { reason: "pulse" });
		}
	} else if (
		!open.verificationId ||
		verificationId !== open.verificationId ||
		!isUuid(verificationId)
	) {
		throw errors.badRequest("Nothing to answer.", { reason: "pulse" });
	}
	const [created] = await database
		.insert(satisfactionPulses)
		.values({
			userId: input.userId,
			moment: open.moment,
			verificationId: open.moment === "review" ? open.verificationId : null,
			body,
		})
		.returning({ id: satisfactionPulses.id });
	if (!created) throw errors.internal("The answer was not stored.");
	await writeAudit(database, {
		actorId: input.userId,
		action: "pulse.answered",
		targetType: "satisfaction_pulse",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: { moment: open.moment },
	});
	return { id: created.id };
}
