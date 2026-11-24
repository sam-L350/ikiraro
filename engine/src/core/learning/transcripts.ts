import { eq } from "drizzle-orm";
import type { Database } from "../../db";
import {
	enrollments,
	taskSubmissions,
	voiceTranscripts,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { reviewCenters } from "./review-queue";

type TranscriptDb = Pick<Database, "insert" | "select" | "update">;

const BODY_LIMIT = 2_000;

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value,
	);
}

/** The trainer writes what the voice note said. A blank stays unwritten. */
export async function writeTranscript(
	database: TranscriptDb,
	input: {
		reviewerId: number;
		submissionId: string;
		body: string;
		ip: string;
	},
): Promise<{ id: string }> {
	if (!isUuid(input.submissionId)) {
		throw errors.notFound("That submission was not found.");
	}
	const body = input.body.trim();
	if (body.length < 1 || body.length > BODY_LIMIT) {
		throw errors.badRequest("Write the transcript.", { reason: "transcript" });
	}
	const centers = await reviewCenters(database, input.reviewerId);
	const [row] = await database
		.select({
			id: taskSubmissions.id,
			evidenceType: taskSubmissions.evidenceType,
			centerId: enrollments.centerId,
		})
		.from(taskSubmissions)
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.where(eq(taskSubmissions.id, input.submissionId))
		.limit(1);
	if (!row || !centers.some((center) => center.id === row.centerId)) {
		throw errors.notFound("That submission was not found.");
	}
	if (row.evidenceType !== "voice") {
		throw errors.badRequest("This work is not a voice note.", {
			reason: "voice",
		});
	}
	const [existing] = await database
		.select({ id: voiceTranscripts.id })
		.from(voiceTranscripts)
		.where(eq(voiceTranscripts.submissionId, row.id))
		.limit(1);
	if (existing) {
		throw errors.conflict("A transcript is already written.", {
			reason: "transcript",
		});
	}
	const [created] = await database
		.insert(voiceTranscripts)
		.values({
			submissionId: row.id,
			body,
			authorUserId: input.reviewerId,
		})
		.returning({ id: voiceTranscripts.id });
	if (!created) throw errors.internal("The transcript was not stored.");
	await writeAudit(database, {
		actorId: input.reviewerId,
		action: "transcript.written",
		targetType: "voice_transcript",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: { submissionId: row.id },
	});
	return { id: created.id };
}
