/** How many queued actions one device keeps. */
export const OUTBOX_ITEM_LIMIT = 24;
/** Encoded payload bytes, not the decrypted photo on screen. */
export const OUTBOX_BYTE_LIMIT = 8 * 1024 * 1024;
const NOTE_LIMIT = 2_000;

const SERVER_WINS = new Set([
	"pending",
	"in_review",
	"approved",
	"rejected",
	"escalated",
]);

export type ServerAttempt = {
	id: string;
	taskId: string;
	status: string;
	note: string | null;
};

export type DraftPlan =
	| { action: "send" }
	| { action: "server" }
	| { action: "merge"; serverId: string; note: string; submit: boolean }
	| { action: "ask"; serverId: string; serverNote: string | null };

/**
 * A review or a submitted attempt on the server stands.
 * Two drafts with the same words fold together. Different words ask the learner.
 */
export function planDraftSync(input: {
	localId: string;
	taskId: string;
	evidenceType: "photo" | "file" | "note";
	localNote: string | null;
	submit: boolean;
	server: readonly ServerAttempt[];
}): DraftPlan {
	const rows = input.server.filter((row) => row.taskId === input.taskId);
	if (rows.some((row) => SERVER_WINS.has(row.status))) {
		return { action: "server" };
	}
	const draft = rows.find((row) => row.status === "draft");
	if (!draft) return { action: "send" };
	if (input.evidenceType !== "note") {
		if (draft.id === input.localId && input.submit) {
			return {
				action: "merge",
				serverId: draft.id,
				note: (draft.note ?? "").trim(),
				submit: true,
			};
		}
		if (draft.id === input.localId) return { action: "server" };
		return { action: "ask", serverId: draft.id, serverNote: draft.note };
	}
	const local = (input.localNote ?? "").trim();
	const saved = (draft.note ?? "").trim();
	if (local === saved || (local.length > 0 && saved.includes(local))) {
		if (!input.submit) return { action: "server" };
		return {
			action: "merge",
			serverId: draft.id,
			note: saved || local,
			submit: true,
		};
	}
	if (saved.length === 0 || local.includes(saved)) {
		if (local.length > NOTE_LIMIT) {
			return { action: "ask", serverId: draft.id, serverNote: draft.note };
		}
		return {
			action: "merge",
			serverId: draft.id,
			note: local,
			submit: input.submit,
		};
	}
	return { action: "ask", serverId: draft.id, serverNote: draft.note };
}

export function queueFits(
	existingCount: number,
	existingBytes: number,
	nextBytes: number,
): boolean {
	if (nextBytes > OUTBOX_BYTE_LIMIT) return false;
	if (existingCount >= OUTBOX_ITEM_LIMIT) return false;
	return existingBytes + nextBytes <= OUTBOX_BYTE_LIMIT;
}

/** Course text, the learner's progress, a center pack, and a trainer's open queue. */
export function isCourseRead(pathname: string): boolean {
	return (
		pathname === "/api/v1/enrollments" ||
		/^\/api\/v1\/enrollments\/[^/]+$/.test(pathname) ||
		pathname === "/api/v1/catalog" ||
		/^\/api\/v1\/catalog\/[^/]+$/.test(pathname) ||
		pathname === "/api/v1/content-packs" ||
		pathname === "/api/v1/evidence-queue" ||
		/^\/api\/v1\/evidence-queue\/[^/]+$/.test(pathname)
	);
}

export function isMediaRequest(
	destination: string,
	contentType: string,
): boolean {
	if (
		destination === "image" ||
		destination === "audio" ||
		destination === "video"
	) {
		return true;
	}
	return /^(image|audio|video)\//.test(contentType);
}

/** Data saver never stores a picture, a sound, or a video. */
export function shouldCacheMedia(
	dataSaver: boolean,
	destination: string,
	contentType: string,
): boolean {
	if (!isMediaRequest(destination, contentType)) return true;
	return !dataSaver;
}
