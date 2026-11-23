import { isApiClientError } from "../api/error";

/** Storage key reserved for the queue. Phase 6.3 persists the payload here. */
export const OUTBOX_STORAGE_KEY = "ikiraro.outbox";

/**
 * One queued submission. The same `id` is the client's attempt id, so a retry
 * is the same row on the server. Phase 6.3 persists this object as JSON.
 */
export type SubmissionQueuePayload = {
	kind: "submission";
	id: string;
	enrollmentId: string;
	taskId: string;
	evidenceType: "photo" | "file" | "note";
	contentType: string;
	sha256: string;
	bytesBase64: string;
	note: string | null;
	deviceInfo: string;
	geoLat: number | null;
	geoLng: number | null;
	submit: true;
};

type QueueItem = {
	id: string;
	enqueuedAt: string;
	attempts: number;
	payload: SubmissionQueuePayload;
};

type Removable = { removeItem(key: string): void };

const items: QueueItem[] = [];
const listeners = new Set<() => void>();
let flushing = false;

function notify(): void {
	for (const listener of listeners) listener();
}

export function queueCount(): number {
	return items.length;
}

export function isQueued(id: string): boolean {
	return items.some((item) => item.id === id);
}

export function subscribeQueue(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Keep one row per attempt id. A second enqueue replaces the payload. */
export function enqueueSubmission(payload: SubmissionQueuePayload): void {
	const existing = items.find((item) => item.id === payload.id);
	if (existing) {
		existing.payload = payload;
	} else {
		items.push({
			id: payload.id,
			enqueuedAt: new Date().toISOString(),
			attempts: 0,
			payload,
		});
	}
	notify();
}

export function removeQueued(id: string): void {
	const index = items.findIndex((item) => item.id === id);
	if (index < 0) return;
	items.splice(index, 1);
	notify();
}

/** A dropped connection waits. A refusal from the server does not. */
export function classifyFailure(error: unknown): "retry" | "drop" {
	if (!isApiClientError(error)) return "retry";
	if (
		error.status === 401 ||
		error.status === 408 ||
		error.status === 429 ||
		error.status >= 500
	) {
		return "retry";
	}
	return "drop";
}

/**
 * Send the oldest waiting attempts. A network failure stays in the queue.
 * The bytes live in this tab only; a reload drops them until phase 6.3.
 */
export async function flushQueue(
	send: (payload: SubmissionQueuePayload) => Promise<void>,
): Promise<void> {
	if (flushing) return;
	flushing = true;
	try {
		for (const item of [...items]) {
			try {
				await send(item.payload);
				removeQueued(item.id);
			} catch (error) {
				if (classifyFailure(error) === "drop") {
					removeQueued(item.id);
					continue;
				}
				item.attempts += 1;
				notify();
				if (isApiClientError(error) && error.status === 401) break;
			}
		}
	} finally {
		flushing = false;
	}
}

/** Drops queued work from this browser. Idle logout on a shared computer calls this. */
export function clearOutbox(storage: Removable = localStorage): void {
	items.splice(0, items.length);
	storage.removeItem(OUTBOX_STORAGE_KEY);
	notify();
}

export async function endSharedSession(input: {
	storage?: Removable;
	logout: () => Promise<void>;
}): Promise<void> {
	clearOutbox(input.storage);
	await input.logout();
}
