/** Storage key for the submission outbox. Later phases write the queue here. */
export const OUTBOX_STORAGE_KEY = "ikiraro.outbox";

type Removable = { removeItem(key: string): void };

/** Drops queued work from this browser. Idle logout on a shared computer calls this. */
export function clearOutbox(storage: Removable = localStorage): void {
	storage.removeItem(OUTBOX_STORAGE_KEY);
}

export async function endSharedSession(input: {
	storage?: Removable;
	logout: () => Promise<void>;
}): Promise<void> {
	clearOutbox(input.storage);
	await input.logout();
}
