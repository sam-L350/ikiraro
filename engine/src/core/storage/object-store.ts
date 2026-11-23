export type ObjectIntent = {
	key: string;
	contentType: string;
};

/**
 * Where task media will live. Phase 4.1 replaces this stub with a private store.
 * Calling reserve does not upload bytes.
 */
export interface ObjectStore {
	reserve(intent: ObjectIntent): Promise<{ key: string }>;
}

export function createStubObjectStore(): ObjectStore {
	return {
		async reserve(intent) {
			return { key: intent.key };
		},
	};
}

export const objectStore: ObjectStore = createStubObjectStore();
