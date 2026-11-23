import {
	createVaultKey,
	exportVaultKey,
	importVaultKey,
	openJson,
	sealJson,
} from "./vault";

const DATABASE = "ikiraro-offline";
const KEY_RECORD = "aes";
const OUTBOX_RECORD = "outbox";
const COURSE_INDEX = "course-index";
const COURSE_LIMIT = 32;

type CourseIndex = { key: string; savedAt: string }[];

let memoryKey: CryptoKey | null = null;
let epoch = 0;

function idbAvailable(): boolean {
	return typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE, 1);
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains("records")) {
				database.createObjectStore("records");
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function readRecord(key: string): Promise<string | null> {
	if (!idbAvailable()) return null;
	const database = await openDatabase();
	try {
		const value = await requestResult(
			database
				.transaction("records", "readonly")
				.objectStore("records")
				.get(key),
		);
		return typeof value === "string" ? value : null;
	} finally {
		database.close();
	}
}

async function writeRecord(key: string, value: string): Promise<void> {
	if (!idbAvailable()) return;
	const database = await openDatabase();
	try {
		await requestResult(
			database
				.transaction("records", "readwrite")
				.objectStore("records")
				.put(value, key),
		);
	} finally {
		database.close();
	}
}

async function sessionKey(): Promise<CryptoKey | null> {
	if (!idbAvailable()) return null;
	if (memoryKey) return memoryKey;
	const existing = await readRecord(KEY_RECORD);
	if (existing) {
		memoryKey = await importVaultKey(existing);
		return memoryKey;
	}
	const created = await createVaultKey();
	await writeRecord(KEY_RECORD, await exportVaultKey(created));
	memoryKey = created;
	return memoryKey;
}

export function currentEpoch(): number {
	return epoch;
}

/** Drop the key and every sealed row. Logout calls this. */
export async function wipeVault(): Promise<void> {
	epoch += 1;
	memoryKey = null;
	if (!idbAvailable()) return;
	await new Promise<void>((resolve, reject) => {
		const request = indexedDB.deleteDatabase(DATABASE);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
		request.onblocked = () => resolve();
	});
}

export async function saveSealed(key: string, value: unknown): Promise<void> {
	const seen = epoch;
	const cryptoKey = await sessionKey();
	if (!cryptoKey || seen !== epoch) return;
	const sealed = await sealJson(cryptoKey, value);
	if (seen !== epoch) return;
	await writeRecord(key, JSON.stringify(sealed));
}

export async function readSealed<T>(key: string): Promise<T | null> {
	const seen = epoch;
	const cryptoKey = await sessionKey();
	if (!cryptoKey || seen !== epoch) return null;
	const stored = await readRecord(key);
	if (!stored || seen !== epoch) return null;
	return openJson<T>(
		cryptoKey,
		JSON.parse(stored) as { iv: string; box: string },
	);
}

export async function saveOutbox(value: unknown): Promise<void> {
	await saveSealed(OUTBOX_RECORD, value);
}

export async function readOutbox<T>(): Promise<T | null> {
	return readSealed<T>(OUTBOX_RECORD);
}

export async function saveCourse(path: string, value: unknown): Promise<void> {
	const encoded = JSON.stringify(value);
	if (encoded.length > 1_500_000) return;
	await saveSealed(`course:${path}`, value);
	const index = (await readSealed<CourseIndex>(COURSE_INDEX)) ?? [];
	const next = [
		{ key: path, savedAt: new Date().toISOString() },
		...index.filter((row) => row.key !== path),
	].slice(0, COURSE_LIMIT);
	const dropped = index.filter(
		(row) => !next.some((item) => item.key === row.key),
	);
	await saveSealed(COURSE_INDEX, next);
	for (const row of dropped) {
		if (!idbAvailable()) continue;
		const database = await openDatabase();
		try {
			await requestResult(
				database
					.transaction("records", "readwrite")
					.objectStore("records")
					.delete(`course:${row.key}`),
			);
		} finally {
			database.close();
		}
	}
}

export async function readCourse<T>(path: string): Promise<T | null> {
	return readSealed<T>(`course:${path}`);
}
