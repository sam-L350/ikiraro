import { expect, test } from "bun:test";
import { ApiClientError } from "../api/error";
import {
	classifyFailure,
	clearOutbox,
	endSharedSession,
	enqueueReview,
	enqueueSubmission,
	flushQueue,
	OUTBOX_STORAGE_KEY,
	queueCount,
	type ReviewQueuePayload,
	type SubmissionQueuePayload,
} from "./outbox";

function payload(id: string): SubmissionQueuePayload {
	return {
		kind: "submission",
		id,
		enrollmentId: "enrollment",
		taskId: "task",
		evidenceType: "note",
		contentType: "text/plain",
		sha256: "",
		bytesBase64: "",
		note: "A note",
		deviceInfo: "phone",
		geoLat: null,
		geoLng: null,
		submit: true,
	};
}

function api(status: number): ApiClientError {
	return new ApiClientError({
		status,
		code: "TEST",
		message: "test",
	});
}

test("idle logout clears the client outbox key", async () => {
	const removed: string[] = [];
	let loggedOut = false;
	await endSharedSession({
		storage: {
			removeItem(key) {
				removed.push(key);
			},
		},
		logout: async () => {
			loggedOut = true;
		},
	});
	expect(removed).toEqual([OUTBOX_STORAGE_KEY]);
	expect(loggedOut).toBe(true);
});

test("the same attempt stays one queued row", () => {
	clearOutbox({ removeItem() {} });
	enqueueSubmission(payload("same"));
	enqueueSubmission({ ...payload("same"), note: "Updated" });
	expect(queueCount()).toBe(1);
	clearOutbox({ removeItem() {} });
});

test("a dropped connection keeps the attempt and a refusal drops it", async () => {
	clearOutbox({ removeItem() {} });
	enqueueSubmission(payload("retry"));
	enqueueSubmission(payload("drop"));
	enqueueSubmission(payload("later"));
	enqueueSubmission(payload("after"));
	const seen: string[] = [];
	await flushQueue(async (item) => {
		seen.push(item.id);
		if (item.id === "retry") throw new TypeError("Failed to fetch");
		if (item.id === "drop") throw api(409);
		if (item.id === "later") throw api(401);
	});
	expect(seen).toEqual(["retry", "drop", "later"]);
	expect(queueCount()).toBe(3);
	expect(classifyFailure(api(500))).toBe("retry");
	expect(classifyFailure(api(400))).toBe("drop");
	clearOutbox({ removeItem() {} });
	expect(queueCount()).toBe(0);
});

test("a later edit keeps the first review time", async () => {
	clearOutbox({ removeItem() {} });
	const first: ReviewQueuePayload = {
		kind: "review",
		id: "first-key",
		submissionId: "submission",
		decision: "approved",
		note: "Seen",
		reviewedAt: "2026-01-01T00:00:00.000Z",
	};
	enqueueReview(first);
	enqueueReview({
		...first,
		id: "second-key",
		decision: "needs_revision",
		note: "Change it",
		reviewedAt: "2026-02-01T00:00:00.000Z",
	});
	const seen: ReviewQueuePayload[] = [];
	await flushQueue(async (item) => {
		if (item.kind === "review") seen.push(item);
	});
	expect(seen).toEqual([
		{
			...first,
			decision: "needs_revision",
			note: "Change it",
		},
	]);
	clearOutbox({ removeItem() {} });
	expect(queueCount()).toBe(0);
});
