import { eq } from "drizzle-orm";
import { env } from "../../config/env";
import type { Database } from "../../db";
import { newId } from "../../db/ids";
import { mediaObjects } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { acceptUpload, isAccepted } from "./accept";
import {
	COMPRESS_TARGET_BYTES,
	EVIDENCE_URL_SECONDS,
	mediaContentType,
	UPLOAD_URL_SECONDS,
} from "./limits";
import { readMaxBytes } from "./max-bytes";
import type { ObjectStore } from "./object-store";

type MediaDb = Pick<Database, "insert" | "select" | "update">;

export type UploadIntent = {
	id: string;
	uploadUrl: string;
	contentType: string;
	expiresAt: string;
	maxBytes: number;
	compressTargetBytes: number;
};

export type FinalizedMedia = {
	id: string;
	sha256: string;
	byteSize: number;
	contentType: string;
};

export type EvidenceUrl = {
	url: string;
	expiresAt: string;
};

/** Check the type and the door, then hand back a short-lived upload URL. */
export async function createUploadIntent(
	database: MediaDb,
	store: ObjectStore,
	input: {
		ownerUserId: number;
		contentType: string;
		byteSize: number;
		ip: string;
	},
): Promise<UploadIntent> {
	if (env.isProduction && store.kind !== "s3") {
		throw errors.unavailable("Media storage is not configured.");
	}
	const contentType = mediaContentType(input.contentType);
	if (!contentType) {
		throw errors.badRequest("That file type is not allowed.", {
			reason: "type",
		});
	}
	const maxBytes = await readMaxBytes(database);
	if (
		!Number.isInteger(input.byteSize) ||
		input.byteSize < 1 ||
		input.byteSize > maxBytes
	) {
		throw errors.badRequest("That file is too large.", {
			reason: "too_large",
			maxBytes,
		});
	}
	const key = `evidence/${newId()}`;
	const [created] = await database
		.insert(mediaObjects)
		.values({
			ownerUserId: input.ownerUserId,
			objectKey: key,
			contentType,
			declaredBytes: input.byteSize,
			status: "pending",
		})
		.returning({ id: mediaObjects.id });
	if (!created) throw errors.internal("The upload could not be started.");
	const upload = await store.createUploadUrl({
		key,
		contentType,
		expiresInSeconds: UPLOAD_URL_SECONDS,
	});
	await writeAudit(database, {
		actorId: input.ownerUserId,
		action: "media.upload_intent",
		targetType: "media_object",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: { contentType, byteSize: input.byteSize },
	});
	return {
		id: created.id,
		uploadUrl: upload.url,
		contentType,
		expiresAt: upload.expiresAt,
		maxBytes,
		compressTargetBytes: COMPRESS_TARGET_BYTES,
	};
}

/** Store the hash only after the bytes match the declared type. */
export async function finalizeMedia(
	database: MediaDb,
	store: ObjectStore,
	input: {
		id: string;
		ownerUserId: number;
		sha256: string;
		ip: string;
	},
): Promise<FinalizedMedia> {
	const [row] = await database
		.select({
			id: mediaObjects.id,
			ownerUserId: mediaObjects.ownerUserId,
			objectKey: mediaObjects.objectKey,
			contentType: mediaObjects.contentType,
			status: mediaObjects.status,
			sha256: mediaObjects.sha256,
			sizeBytes: mediaObjects.sizeBytes,
		})
		.from(mediaObjects)
		.where(eq(mediaObjects.id, input.id))
		.limit(1);
	if (!row || row.ownerUserId !== input.ownerUserId) {
		throw errors.notFound("That file was not found.");
	}
	if (row.status === "ready" && row.sha256 && row.sizeBytes !== null) {
		if (row.sha256 !== input.sha256.trim().toLowerCase()) {
			throw errors.conflict("That file was already stored.", {
				reason: "hash",
			});
		}
		return {
			id: row.id,
			sha256: row.sha256,
			byteSize: row.sizeBytes,
			contentType: row.contentType,
		};
	}
	const stored = await store.read(row.objectKey);
	if (!stored) {
		throw errors.conflict("The file has not arrived.", { reason: "missing" });
	}
	const maxBytes = await readMaxBytes(database);
	const accepted = acceptUpload({
		declaredType: row.contentType,
		bytes: stored.bytes,
		claimedSha256: input.sha256,
		maxBytes,
	});
	if (!isAccepted(accepted)) {
		throw errors.badRequest("That file was refused.", {
			reason: accepted.reason,
		});
	}
	await database
		.update(mediaObjects)
		.set({
			status: "ready",
			sha256: accepted.sha256,
			sizeBytes: accepted.size,
			contentType: accepted.contentType,
			finalizedAt: new Date(),
		})
		.where(eq(mediaObjects.id, row.id));
	await writeAudit(database, {
		actorId: input.ownerUserId,
		action: "media.finalized",
		targetType: "media_object",
		targetId: row.id,
		ipAddress: input.ip,
		metadata: { sha256: accepted.sha256, byteSize: accepted.size },
	});
	return {
		id: row.id,
		sha256: accepted.sha256,
		byteSize: accepted.size,
		contentType: accepted.contentType,
	};
}

/** A read URL that expires in minutes. Pending files have none. */
export async function createEvidenceUrl(
	database: MediaDb,
	store: ObjectStore,
	input: { id: string; ownerUserId: number },
): Promise<EvidenceUrl> {
	const [row] = await database
		.select({
			ownerUserId: mediaObjects.ownerUserId,
			objectKey: mediaObjects.objectKey,
			status: mediaObjects.status,
		})
		.from(mediaObjects)
		.where(eq(mediaObjects.id, input.id))
		.limit(1);
	if (!row || row.ownerUserId !== input.ownerUserId) {
		throw errors.notFound("That file was not found.");
	}
	if (row.status !== "ready") {
		throw errors.conflict("That file is not ready.", { reason: "not_ready" });
	}
	const download = await store.createDownloadUrl({
		key: row.objectKey,
		expiresInSeconds: EVIDENCE_URL_SECONDS,
	});
	return { url: download.url, expiresAt: download.expiresAt };
}
