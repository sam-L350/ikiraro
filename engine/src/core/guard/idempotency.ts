import type { JsonValue } from "../../db/schema";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

type Slot = {
	key: string;
	route: string;
	actorKey: string;
};

type Stored = {
	response: JsonValue;
};

export type IdempotencyStore = {
	get(slot: Slot): Promise<Stored | null>;
	put(slot: Slot, value: Stored): Promise<void>;
};

export function createMemoryIdempotencyStore(): IdempotencyStore {
	const rows = new Map<string, Stored>();
	const id = (slot: Slot) => `${slot.actorKey}\n${slot.route}\n${slot.key}`;
	return {
		async get(slot) {
			return rows.get(id(slot)) ?? null;
		},
		async put(slot, value) {
			rows.set(id(slot), value);
		},
	};
}

/**
 * Runs `run` once per key. A repeat with the same key, route, and actor
 * returns the stored JSON and does not call `run` again.
 */
export async function runIdempotent<T extends JsonValue>(input: {
	store: IdempotencyStore;
	key: string;
	route: string;
	actorKey: string;
	run: () => Promise<T>;
}): Promise<T> {
	const slot = {
		key: input.key,
		route: input.route,
		actorKey: input.actorKey,
	};
	const existing = await input.store.get(slot);
	if (existing) return existing.response as T;
	const response = await input.run();
	await input.store.put(slot, { response });
	return response;
}
