import { isApiClientError } from "@/lib/api/error";
import { callEngine, invalidateEngine } from "@/lib/engine";
import { base64ToBytes } from "./bytes";
import { OutboxDecision } from "./decision";
import type { QueuePayload, SubmissionQueuePayload } from "./outbox";
import { planDraftSync, type ServerAttempt } from "./policy";

type SyncHint = {
	force?: "mine";
	serverId?: string;
};

/** Upload the stored bytes, then create the same attempt id. */
export async function deliverSubmission(
	payload: SubmissionQueuePayload,
): Promise<void> {
	let mediaId: string | undefined;
	if (payload.evidenceType !== "note") {
		const decoded = base64ToBytes(payload.bytesBase64);
		const bytes = new Uint8Array(decoded.byteLength);
		bytes.set(decoded);
		const intent = await callEngine("/media/upload-intent", {
			body: {
				contentType: payload.contentType,
				byteSize: bytes.byteLength,
			},
		});
		const put = await fetch(intent.uploadUrl, {
			method: "PUT",
			headers: { "content-type": intent.contentType },
			body: new Blob([bytes], { type: payload.contentType }),
			credentials: "omit",
		});
		if (!put.ok) {
			throw new Error("The file did not upload.");
		}
		const finalized = await callEngine("/media/:id/finalize", {
			body: { id: intent.id, sha256: payload.sha256 },
		});
		mediaId = finalized.id;
	}
	await callEngine("/submissions/create", {
		body: {
			id: payload.id,
			enrollmentId: payload.enrollmentId,
			taskId: payload.taskId,
			submit: true,
			deviceInfo: payload.deviceInfo,
			...(mediaId ? { mediaId } : {}),
			...(payload.note ? { note: payload.note } : {}),
			...(payload.geoLat !== null && payload.geoLng !== null
				? { geoLat: payload.geoLat, geoLng: payload.geoLng }
				: {}),
		},
	});
	await invalidateEngine("/enrollments/:id/submissions");
}

async function writeDraft(
	id: string,
	note: string,
	submit: boolean,
): Promise<void> {
	await callEngine("/submissions/:id/update", {
		body: {
			id,
			...(note ? { note } : {}),
			submit,
		},
	});
	await invalidateEngine("/enrollments/:id/submissions");
}

function decisionFor(error: unknown): "server" | "ask" | null {
	if (!isApiClientError(error) || error.status !== 409) return null;
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "closed":
		case "complete":
		case "limit":
			return "server";
		case "open":
			return "ask";
		default:
			return null;
	}
}

/**
 * Replay one queued action. A server decision is not overwritten.
 * A different draft asks the learner before it is replaced.
 */
export async function deliverQueued(
	payload: QueuePayload,
	hint: SyncHint = {},
): Promise<void> {
	if (payload.kind === "review") {
		try {
			await callEngine("/verifications/create", {
				body: {
					submissionId: payload.submissionId,
					decision: payload.decision,
					note: payload.note,
					reviewedAt: payload.reviewedAt,
					idempotencyKey: payload.id,
					...(payload.reasonCode ? { reasonCode: payload.reasonCode } : {}),
					...(payload.scores ? { scores: payload.scores } : {}),
					...(payload.inPerson ? { inPerson: payload.inPerson } : {}),
				},
			});
			await invalidateEngine("/evidence-queue");
			await invalidateEngine("/evidence-queue/:id");
		} catch (error) {
			if (decisionFor(error) === "server") throw new OutboxDecision("server");
			throw error;
		}
		return;
	}
	if (payload.kind === "progress") {
		await callEngine("/enrollments/:id/start", {
			body: { id: payload.enrollmentId, taskId: payload.taskId },
		});
		await invalidateEngine("/enrollments");
		await invalidateEngine("/enrollments/:id");
		return;
	}
	try {
		if (hint.force === "mine" && hint.serverId) {
			await writeDraft(hint.serverId, payload.note ?? "", payload.submit);
			return;
		}
		const history = await callEngine("/enrollments/:id/submissions", {
			query: { id: payload.enrollmentId },
		});
		const server: ServerAttempt[] = history.submissions.map((row) => ({
			id: row.id,
			taskId: row.taskId,
			status: row.status,
			note: row.note,
		}));
		const plan = planDraftSync({
			localId: payload.id,
			taskId: payload.taskId,
			evidenceType: payload.evidenceType,
			localNote: payload.note,
			submit: payload.submit,
			server,
		});
		switch (plan.action) {
			case "send":
				await deliverSubmission(payload);
				return;
			case "server":
				throw new OutboxDecision("server");
			case "merge":
				await writeDraft(plan.serverId, plan.note, plan.submit);
				return;
			case "ask":
				throw new OutboxDecision("ask", plan.serverId, plan.serverNote);
			default: {
				const unreachable: never = plan;
				throw unreachable;
			}
		}
	} catch (error) {
		if (error instanceof OutboxDecision) throw error;
		const decision = decisionFor(error);
		if (decision === "server") throw new OutboxDecision("server");
		if (decision === "ask") throw new OutboxDecision("ask");
		throw error;
	}
}
