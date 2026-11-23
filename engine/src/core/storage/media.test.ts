import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestEnv } from "../../../test/helpers";
import { createApp } from "../../app";
import * as schema from "../../db/schema";
import { mediaObjects } from "../../db/schema";
import { isApiError } from "../api/error";
import { insertUserWithPassport } from "../identity/create-user";
import { acceptUpload, isAccepted } from "./accept";
import { COMPRESS_TARGET_BYTES, DEFAULT_MAX_BYTES } from "./limits";
import { newestMaxBytes } from "./max-bytes";
import { createEvidenceUrl, createUploadIntent, finalizeMedia } from "./media";
import {
	createMemoryObjectStore,
	createS3ObjectStore,
	getObjectStore,
	setObjectStoreForTests,
} from "./object-store";
import { presignS3Url } from "./s3-sign";
import { issueMediaToken, readMediaToken } from "./token";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const png = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

describe("private media checks", () => {
	test("a jpeg is accepted and a mismatched type stores no hash", () => {
		const accepted = acceptUpload({
			declaredType: "image/jpeg",
			bytes: jpeg,
			claimedSha256: sha256(jpeg),
			maxBytes: DEFAULT_MAX_BYTES,
		});
		expect(isAccepted(accepted) ? accepted.sha256 : null).toBe(sha256(jpeg));

		const refused = acceptUpload({
			declaredType: "image/jpeg",
			bytes: png,
			claimedSha256: sha256(png),
			maxBytes: DEFAULT_MAX_BYTES,
		});
		expect(refused).toEqual({ reason: "type" });
		expect(isAccepted(refused)).toBe(false);
	});

	test("an oversized file and a wrong hash are refused", () => {
		expect(
			acceptUpload({
				declaredType: "image/jpeg",
				bytes: jpeg,
				claimedSha256: sha256(jpeg),
				maxBytes: 2,
			}),
		).toEqual({ reason: "size" });
		expect(
			acceptUpload({
				declaredType: "image/jpeg",
				bytes: jpeg,
				claimedSha256: "0".repeat(64),
				maxBytes: DEFAULT_MAX_BYTES,
			}),
		).toEqual({ reason: "hash" });
	});

	test("the door defaults to 10 MB and the compress target stays under 400 KB", () => {
		expect(DEFAULT_MAX_BYTES).toBe(10 * 1024 * 1024);
		expect(COMPRESS_TARGET_BYTES).toBe(400 * 1024);
		expect(newestMaxBytes([])).toBe(DEFAULT_MAX_BYTES);
		expect(
			newestMaxBytes([
				{ version: 1, value: 1024 },
				{ version: 2, value: 2048 },
			]),
		).toBe(2048);
	});

	test("a token expires and a changed secret does not verify", () => {
		const secret = "test-pepper-value";
		const token = issueMediaToken(
			{
				key: "evidence/one",
				method: "GET",
				contentType: "",
				exp: 2_000,
			},
			secret,
		);
		expect(readMediaToken(token, secret, 1_000)?.key).toBe("evidence/one");
		expect(readMediaToken(token, secret, 2_000)).toBeNull();
		expect(readMediaToken(token, "another-pepper-value", 1_000)).toBeNull();
	});

	test("a signed read URL expires and is not a public bucket link", async () => {
		useTestEnv();
		const store = createMemoryObjectStore({
			apiUrl: "http://localhost:3000",
			secret: "test-pepper-value",
		});
		setObjectStoreForTests(store);
		await store.put({
			key: "evidence/photo",
			contentType: "image/jpeg",
			bytes: jpeg,
		});
		const download = await store.createDownloadUrl({
			key: "evidence/photo",
			expiresInSeconds: 300,
		});
		expect(
			download.url.startsWith("http://localhost:3000/api/media/file?token="),
		).toBe(true);
		expect(download.url.includes("public")).toBe(false);
		const app = createApp();
		const ok = await app.fetch(new Request(download.url));
		expect(ok.status).toBe(200);
		expect(ok.headers.get("content-type")).toBe("image/jpeg");
		expect(new Uint8Array(await ok.arrayBuffer())).toEqual(jpeg);

		const expired = issueMediaToken(
			{
				key: "evidence/photo",
				method: "GET",
				contentType: "",
				exp: Date.now() - 1_000,
			},
			"test-pepper-value",
		);
		const denied = await app.fetch(
			new Request(`http://localhost:3000/api/media/file?token=${expired}`),
		);
		expect(denied.status).toBe(401);
		setObjectStoreForTests(undefined);
	});

	test("an S3 upload URL is signed, stable, and not public", () => {
		const input = {
			method: "PUT" as const,
			endpoint: "https://example.r2.cloudflarestorage.com",
			bucket: "evidence",
			key: "evidence/abc",
			accessKeyId: "AKIDEXAMPLE",
			secretAccessKey: "example-secret",
			region: "auto",
			now: new Date("2026-01-01T00:00:00.000Z"),
			expiresInSeconds: 600,
			contentType: "image/jpeg",
		};
		const first = presignS3Url(input);
		const second = presignS3Url(input);
		expect(first).toBe(second);
		expect(
			first.startsWith("https://example.r2.cloudflarestorage.com/evidence/"),
		).toBe(true);
		expect(first.includes("X-Amz-Expires=600")).toBe(true);
		expect(first.includes("x-amz-acl")).toBe(false);
		expect(first.includes("public-read")).toBe(false);
		expect(
			presignS3Url({ ...input, secretAccessKey: "other-secret" }),
		).not.toBe(first);

		const store = createS3ObjectStore(
			{
				accountId: "account",
				accessKeyId: "AKIDEXAMPLE",
				secretAccessKey: "example-secret",
				bucket: "evidence",
				endpoint: "https://example.r2.cloudflarestorage.com",
			},
			() => new Date("2026-01-01T00:00:00.000Z"),
		);
		expect(store.kind).toBe("s3");
	});

	test("production refuses to keep learner photos in memory", async () => {
		useTestEnv({
			NODE_ENV: "production",
			OTP_PEPPER: "test-pepper-value",
			DATABASE_URL: "postgres://localhost:5432/ikiraro",
		});
		const store = createMemoryObjectStore({
			apiUrl: "https://localhost:3000",
			secret: "test-pepper-value",
		});
		const database = {
			select: () => {
				throw new Error("the database should not be touched");
			},
			insert: () => {
				throw new Error("the database should not be touched");
			},
			update: () => {
				throw new Error("the database should not be touched");
			},
		};
		try {
			await createUploadIntent(database as never, store, {
				ownerUserId: 1,
				contentType: "image/jpeg",
				byteSize: jpeg.byteLength,
				ip: "127.0.0.1",
			});
			throw new Error("expected the store to be refused");
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(503);
		}
	});

	test("a partial R2 configuration is refused without printing a secret", () => {
		useTestEnv();
		setObjectStoreForTests(undefined);
		process.env.R2_BUCKET = "evidence";
		process.env.R2_SECRET_ACCESS_KEY = "do-not-print";
		try {
			expect(() => getObjectStore()).toThrow(
				"R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET must be set together",
			);
		} finally {
			delete process.env.R2_BUCKET;
			delete process.env.R2_SECRET_ACCESS_KEY;
			setObjectStoreForTests(undefined);
		}
	});
});

function isUsable(url: string): boolean {
	try {
		return new URL(url).hostname !== "db";
	} catch {
		return false;
	}
}

function databaseUrl(): string | null {
	const fromEnv = process.env.DATABASE_URL;
	if (fromEnv && isUsable(fromEnv)) return fromEnv;
	try {
		const path = resolve(
			dirname(fileURLToPath(import.meta.url)),
			"../../../.env.local",
		);
		const text = readFileSync(path, "utf8");
		for (const line of text.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed.startsWith("DATABASE_URL=")) continue;
			const value = trimmed
				.slice("DATABASE_URL=".length)
				.trim()
				.replace(/^['"]|['"]$/g, "");
			if (isUsable(value)) return value;
		}
	} catch {
		return null;
	}
	return null;
}

function openDatabase() {
	const url = databaseUrl();
	if (!url) return null;
	const client = postgres(url, { max: 1, connect_timeout: 15 });
	return { client, db: drizzle({ client, schema }) };
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

describe("finalized media hash", () => {
	test("a mismatch leaves the hash empty and a match stores it", async () => {
		useTestEnv();
		if (!suite) return;
		const store = createMemoryObjectStore({
			apiUrl: "http://localhost:3000",
			secret: "test-pepper-value",
		});
		const email = `media-${crypto.randomUUID()}@example.test`;
		const created = await insertUserWithPassport(suite.db, { email });
		const intent = await createUploadIntent(suite.db, store, {
			ownerUserId: created.userId,
			contentType: "image/jpeg",
			byteSize: jpeg.byteLength,
			ip: "127.0.0.1",
		});
		const [pending] = await suite.db
			.select({
				objectKey: mediaObjects.objectKey,
				sha256: mediaObjects.sha256,
			})
			.from(mediaObjects)
			.where(eq(mediaObjects.id, intent.id))
			.limit(1);
		if (!pending) throw new Error("missing media row");
		await store.put({
			key: pending.objectKey,
			contentType: "image/jpeg",
			bytes: jpeg,
		});
		try {
			await finalizeMedia(suite.db, store, {
				id: intent.id,
				ownerUserId: created.userId,
				sha256: "0".repeat(64),
				ip: "127.0.0.1",
			});
			throw new Error("expected the hash to be refused");
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(400);
		}
		const [stillPending] = await suite.db
			.select({ status: mediaObjects.status, sha256: mediaObjects.sha256 })
			.from(mediaObjects)
			.where(eq(mediaObjects.id, intent.id))
			.limit(1);
		expect(stillPending?.status).toBe("pending");
		expect(stillPending?.sha256).toBeNull();

		const ready = await finalizeMedia(suite.db, store, {
			id: intent.id,
			ownerUserId: created.userId,
			sha256: sha256(jpeg),
			ip: "127.0.0.1",
		});
		expect(ready.sha256).toBe(sha256(jpeg));
		const evidence = await createEvidenceUrl(suite.db, store, {
			id: intent.id,
			ownerUserId: created.userId,
		});
		expect(evidence.url.includes("/api/media/file?token=")).toBe(true);
		expect(evidence.url.includes(intent.id)).toBe(false);
	}, 20_000);
});
