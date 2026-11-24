import { isApiClientError } from "../api/error";
import { OutboxDecision } from "./decision";
import { readOutbox, saveOutbox, wipeVault } from "./durable";
import { queueFits } from "./policy";
import { postOffline } from "./register";

/** Storage key reserved for the queue. The payload itself lives in the encrypted store. */
export const OUTBOX_STORAGE_KEY = "ikiraro.outbox";

/**
 * One queued submission. The same `id` is the client's attempt id, so a retry
 * is the same row on the server.
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

/** A progress tick. Completion still waits for an approved submission. */
export type ProgressQueuePayload = {
	kind: "progress";
	id: string;
	enrollmentId: string;
	taskId: string;
};

/** A trainer decision made on this device. `reviewedAt` is that moment. */
export type ReviewQueuePayload = {
	kind: "review";
	id: string;
	submissionId: string;
	decision: "approved" | "needs_revision" | "rejected";
	note: string;
	reasonCode?: "not_the_task" | "not_the_learner" | "unreadable" | "incomplete";
	scores?: { criterionId: string; score: number }[];
	inPerson?: { location: string; observedAt: string };
	reviewedAt: string;
};

export type QueuePayload =
	| SubmissionQueuePayload
	| ProgressQueuePayload
	| ReviewQueuePayload;

type QueueItem = {
	id: string;
	enqueuedAt: string;
	attempts: number;
	payload: QueuePayload;
	attention?: "ask";
	serverId?: string;
	serverNote?: string | null;
	force?: "mine";
};

export type DraftAsk = {
	id: string;
	serverNote: string | null;
};

type Removable = { removeItem(key: string): void };

const items: QueueItem[] = [];
const listeners = new Set<() => void>();
let flushing = false;
let banner: "server" | "capped" | null = null;
let hydrated = false;

function notify(): void {
	for (const listener of listeners) listener();
}

function remember(): void {
	void saveOutbox(items).catch(() => {
		// The in-memory queue still retries while this tab is open.
	});
}

export function queueCount(): number {
	return items.filter((item) => item.attention !== "ask").length;
}

export function queueBanner(): "server" | "capped" | null {
	return banner;
}

export function firstAsk(): DraftAsk | null {
	const asking = items.find((item) => item.attention === "ask");
	if (!asking) return null;
	return { id: asking.id, serverNote: asking.serverNote ?? null };
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

function weight(payload: QueuePayload): number {
	return JSON.stringify(payload).length;
}

function usedBytes(): number {
	return items.reduce((sum, item) => sum + weight(item.payload), 0);
}

/** Keep one row per attempt id. A second enqueue replaces the payload. */
export function enqueueSubmission(
	payload: SubmissionQueuePayload,
): "queued" | "capped" {
	const existing = items.find((item) => item.id === payload.id);
	const nextBytes = weight(payload);
	const without = existing
		? usedBytes() - weight(existing.payload)
		: usedBytes();
	if (
		!queueFits(existing ? items.length - 1 : items.length, without, nextBytes)
	) {
		banner = "capped";
		notify();
		return "capped";
	}
	if (existing) {
		existing.payload = payload;
		existing.attention = undefined;
		existing.force = undefined;
	} else {
		items.push({
			id: payload.id,
			enqueuedAt: new Date().toISOString(),
			attempts: 0,
			payload,
		});
	}
	if (banner === "capped") banner = null;
	notify();
	remember();
	return "queued";
}

/**
 * One waiting decision per submission. A later edit keeps the first time
 * and the first idempotency key.
 */
export function enqueueReview(
	payload: ReviewQueuePayload,
): "queued" | "capped" {
	const existing = items.find(
		(item) =>
			item.payload.kind === "review" &&
			item.payload.submissionId === payload.submissionId,
	);
	if (existing && existing.payload.kind === "review") {
		existing.payload = {
			...payload,
			id: existing.payload.id,
			reviewedAt: existing.payload.reviewedAt,
		};
		notify();
		remember();
		return "queued";
	}
	const nextBytes = weight(payload);
	if (!queueFits(items.length, usedBytes(), nextBytes)) {
		banner = "capped";
		notify();
		return "capped";
	}
	items.push({
		id: payload.id,
		enqueuedAt: payload.reviewedAt,
		attempts: 0,
		payload,
	});
	notify();
	remember();
	return "queued";
}

/** One progress row per task. Replacing it does not add another. */
export function enqueueProgress(
	payload: ProgressQueuePayload,
): "queued" | "capped" {
	const existing = items.find(
		(item) =>
			item.payload.kind === "progress" &&
			item.payload.enrollmentId === payload.enrollmentId &&
			item.payload.taskId === payload.taskId,
	);
	if (existing) {
		existing.payload = payload;
		notify();
		remember();
		return "queued";
	}
	const nextBytes = weight(payload);
	if (!queueFits(items.length, usedBytes(), nextBytes)) {
		banner = "capped";
		notify();
		return "capped";
	}
	items.push({
		id: payload.id,
		enqueuedAt: new Date().toISOString(),
		attempts: 0,
		payload,
	});
	notify();
	remember();
	return "queued";
}

export function removeQueued(id: string): void {
	const index = items.findIndex((item) => item.id === id);
	if (index < 0) return;
	items.splice(index, 1);
	notify();
	remember();
}

/** The learner chose the copy on this device. The next sync writes it. */
export function keepLocalDraft(id: string): void {
	const item = items.find((row) => row.id === id);
	if (!item) return;
	item.attention = undefined;
	item.force = "mine";
	notify();
	remember();
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
 * The sealed copy survives a reload.
 */
export async function flushQueue(
	send: (
		payload: QueuePayload,
		hint: { force?: "mine"; serverId?: string },
	) => Promise<void>,
): Promise<void> {
	if (flushing) return;
	flushing = true;
	try {
		for (const item of [...items]) {
			if (item.attention === "ask") continue;
			try {
				await send(item.payload, {
					force: item.force,
					serverId: item.serverId,
				});
				removeQueued(item.id);
			} catch (error) {
				if (error instanceof OutboxDecision) {
					if (error.choice === "server") {
						banner = "server";
						removeQueued(item.id);
						continue;
					}
					item.attention = "ask";
					item.serverId = error.serverId ?? item.serverId;
					item.serverNote = error.serverNote;
					notify();
					remember();
					continue;
				}
				if (classifyFailure(error) === "drop") {
					removeQueued(item.id);
					continue;
				}
				item.attempts += 1;
				notify();
				remember();
				if (isApiClientError(error) && error.status === 401) break;
			}
		}
	} finally {
		flushing = false;
	}
}

/** Load the sealed queue once per tab. Items already in memory stay. */
export async function hydrateOutbox(): Promise<void> {
	if (hydrated) return;
	hydrated = true;
	try {
		const stored = await readOutbox<QueueItem[]>();
		if (!stored || items.length > 0) return;
		items.push(...stored);
		notify();
	} catch {
		// A sealed row from a wiped key is ignored. The learner can send again.
	}
}

/** Drops queued work from this browser. Idle logout on a shared computer calls this. */
export function clearOutbox(storage: Removable = localStorage): void {
	items.splice(0, items.length);
	banner = null;
	hydrated = false;
	storage.removeItem(OUTBOX_STORAGE_KEY);
	postOffline({ type: "clear" });
	void wipeVault().catch(() => {
		// The key is already forgotten in this tab.
	});
	notify();
}

export async function endSharedSession(input: {
	storage?: Removable;
	logout: () => Promise<void>;
}): Promise<void> {
	clearOutbox(input.storage);
	await input.logout();
}
