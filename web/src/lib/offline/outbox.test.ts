import { expect, test } from "bun:test";
import { endSharedSession, OUTBOX_STORAGE_KEY } from "./outbox";

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
