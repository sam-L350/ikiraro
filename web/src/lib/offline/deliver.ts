import { callEngine, invalidateEngine } from "@/lib/engine";
import { base64ToBytes } from "./bytes";
import type { SubmissionQueuePayload } from "./outbox";

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
