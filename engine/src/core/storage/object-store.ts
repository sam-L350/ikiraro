import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env";
import { presignS3Url } from "./s3-sign";
import { issueMediaToken } from "./token";

export type ObjectIntent = {
	key: string;
	contentType: string;
};

export type StoredBytes = {
	contentType: string;
	bytes: Uint8Array;
};

export type SignedUrl = {
	url: string;
	expiresAt: string;
};

/**
 * Private object storage. The bucket is never public.
 * `reserve` only remembers a key. Bytes move through a signed URL.
 */
export interface ObjectStore {
	readonly kind: "memory" | "file" | "s3";
	reserve(intent: ObjectIntent): Promise<{ key: string }>;
	createUploadUrl(input: {
		key: string;
		contentType: string;
		expiresInSeconds: number;
	}): Promise<SignedUrl>;
	createDownloadUrl(input: {
		key: string;
		expiresInSeconds: number;
	}): Promise<SignedUrl>;
	put(input: StoredBytes & { key: string }): Promise<void>;
	read(key: string): Promise<StoredBytes | null>;
	remove(key: string): Promise<void>;
}

type R2Config = {
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
	endpoint: string;
};

function readR2(source: Record<string, string | undefined>): R2Config | null {
	const accountId = source.R2_ACCOUNT_ID?.trim() ?? "";
	const accessKeyId = source.R2_ACCESS_KEY_ID?.trim() ?? "";
	const secretAccessKey = source.R2_SECRET_ACCESS_KEY?.trim() ?? "";
	const bucket = source.R2_BUCKET?.trim() ?? "";
	const present = [accountId, accessKeyId, secretAccessKey, bucket].filter(
		(value) => value.length > 0,
	);
	if (present.length === 0) return null;
	if (present.length !== 4) {
		throw new Error(
			"R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET must be set together",
		);
	}
	const endpoint =
		source.R2_ENDPOINT?.trim() ||
		`https://${accountId}.r2.cloudflarestorage.com`;
	return { accountId, accessKeyId, secretAccessKey, bucket, endpoint };
}

export function createMemoryObjectStore(input: {
	apiUrl: string;
	secret: string;
	now?: () => number;
}): ObjectStore {
	const objects = new Map<string, StoredBytes>();
	const now = input.now ?? Date.now;
	return {
		kind: "memory",
		async reserve(intent) {
			return { key: intent.key };
		},
		async createUploadUrl(grant) {
			const expiresAt = new Date(now() + grant.expiresInSeconds * 1000);
			const token = issueMediaToken(
				{
					key: grant.key,
					method: "PUT",
					contentType: grant.contentType,
					exp: expiresAt.getTime(),
				},
				input.secret,
			);
			return {
				url: `${input.apiUrl}/api/media/upload?token=${token}`,
				expiresAt: expiresAt.toISOString(),
			};
		},
		async createDownloadUrl(grant) {
			const expiresAt = new Date(now() + grant.expiresInSeconds * 1000);
			const token = issueMediaToken(
				{
					key: grant.key,
					method: "GET",
					contentType: "",
					exp: expiresAt.getTime(),
				},
				input.secret,
			);
			return {
				url: `${input.apiUrl}/api/media/file?token=${token}`,
				expiresAt: expiresAt.toISOString(),
			};
		},
		async put(object) {
			objects.set(object.key, {
				contentType: object.contentType,
				bytes: object.bytes,
			});
		},
		async read(key) {
			return objects.get(key) ?? null;
		},
		async remove(key) {
			objects.delete(key);
		},
	};
}

export function createS3ObjectStore(
	config: R2Config,
	now: () => Date = () => new Date(),
): ObjectStore {
	function signed(
		method: "GET" | "PUT" | "HEAD" | "DELETE",
		key: string,
		expiresInSeconds: number,
		contentType?: string,
	): string {
		return presignS3Url({
			method,
			endpoint: config.endpoint,
			bucket: config.bucket,
			key,
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
			region: "auto",
			now: now(),
			expiresInSeconds,
			contentType,
		});
	}
	return {
		kind: "s3",
		async reserve(intent) {
			return { key: intent.key };
		},
		async createUploadUrl(grant) {
			const expiresAt = new Date(
				now().getTime() + grant.expiresInSeconds * 1000,
			);
			return {
				url: signed(
					"PUT",
					grant.key,
					grant.expiresInSeconds,
					grant.contentType,
				),
				expiresAt: expiresAt.toISOString(),
			};
		},
		async createDownloadUrl(grant) {
			const expiresAt = new Date(
				now().getTime() + grant.expiresInSeconds * 1000,
			);
			return {
				url: signed("GET", grant.key, grant.expiresInSeconds),
				expiresAt: expiresAt.toISOString(),
			};
		},
		async put(object) {
			const url = signed("PUT", object.key, 60, object.contentType);
			const response = await fetch(url, {
				method: "PUT",
				headers: { "content-type": object.contentType },
				body: Buffer.from(object.bytes),
			});
			if (!response.ok) {
				throw new Error("The private store refused the upload");
			}
		},
		async read(key) {
			const url = signed("GET", key, 60);
			const response = await fetch(url);
			if (response.status === 404) return null;
			if (!response.ok) {
				throw new Error("The private store did not return the object");
			}
			const bytes = new Uint8Array(await response.arrayBuffer());
			return {
				contentType: response.headers.get("content-type") ?? "",
				bytes,
			};
		},
		async remove(key) {
			const url = signed("DELETE", key, 60);
			const response = await fetch(url, { method: "DELETE" });
			if (response.ok || response.status === 404) return;
			throw new Error("The private store did not remove the object");
		},
	};
}

function objectPath(directory: string, key: string): string {
	if (key.length === 0 || key.includes("..") || key.startsWith("/")) {
		throw new Error("The storage key is not valid");
	}
	const root = resolve(directory);
	const full = resolve(root, key);
	if (full !== root && !full.startsWith(`${root}/`)) {
		throw new Error("The storage key is not valid");
	}
	return full;
}

/** Development store. The same directory is shared by the API and the seed. */
export function createFileObjectStore(input: {
	directory: string;
	apiUrl: string;
	secret: string;
	now?: () => number;
}): ObjectStore {
	const now = input.now ?? Date.now;
	function signed(
		method: "GET" | "PUT",
		key: string,
		contentType: string,
		expiresInSeconds: number,
	): SignedUrl {
		const expiresAt = new Date(now() + expiresInSeconds * 1000);
		const token = issueMediaToken(
			{
				key,
				method,
				contentType,
				exp: expiresAt.getTime(),
			},
			input.secret,
		);
		const route = method === "PUT" ? "upload" : "file";
		return {
			url: `${input.apiUrl}/api/media/${route}?token=${token}`,
			expiresAt: expiresAt.toISOString(),
		};
	}
	return {
		kind: "file",
		async reserve(intent) {
			return { key: intent.key };
		},
		async createUploadUrl(grant) {
			return signed(
				"PUT",
				grant.key,
				grant.contentType,
				grant.expiresInSeconds,
			);
		},
		async createDownloadUrl(grant) {
			return signed("GET", grant.key, "", grant.expiresInSeconds);
		},
		async put(object) {
			const path = objectPath(input.directory, object.key);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, object.bytes);
			await writeFile(`${path}.type`, object.contentType);
		},
		async read(key) {
			const path = objectPath(input.directory, key);
			try {
				const bytes = await readFile(path);
				const contentType = await readFile(`${path}.type`, "utf8");
				return { contentType, bytes };
			} catch (error) {
				if (
					typeof error === "object" &&
					error !== null &&
					"code" in error &&
					error.code === "ENOENT"
				) {
					return null;
				}
				throw error;
			}
		},
		async remove(key) {
			const path = objectPath(input.directory, key);
			await rm(path, { force: true });
			await rm(`${path}.type`, { force: true });
		},
	};
}

let singleton: ObjectStore | undefined;

export function getObjectStore(): ObjectStore {
	if (!singleton) {
		const source =
			typeof process !== "undefined" && process.env ? process.env : {};
		const r2 = readR2(source);
		if (r2) {
			singleton = createS3ObjectStore(r2);
		} else if (env.isProduction) {
			singleton = createMemoryObjectStore({
				apiUrl: env.apiUrl,
				secret: env.otpPepper,
			});
		} else {
			singleton = createFileObjectStore({
				directory: fileURLToPath(
					new URL("../../../.data/objects/", import.meta.url),
				),
				apiUrl: env.apiUrl,
				secret: env.otpPepper,
			});
		}
	}
	return singleton;
}

/** Tests replace the process-wide store. */
export function setObjectStoreForTests(store: ObjectStore | undefined): void {
	singleton = store;
}
