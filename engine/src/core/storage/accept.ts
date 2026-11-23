import { createHash } from "node:crypto";
import { declaredMatchesBytes } from "./sniff";

export type AcceptedUpload = {
	contentType: string;
	sha256: string;
	size: number;
};

export type RejectedUpload = {
	reason: "type" | "size" | "hash";
};

/** Check the header, the size, and the hash. A mismatch stores nothing. */
export function acceptUpload(input: {
	declaredType: string;
	bytes: Uint8Array;
	claimedSha256: string;
	maxBytes: number;
}): AcceptedUpload | RejectedUpload {
	if (input.bytes.byteLength === 0 || input.bytes.byteLength > input.maxBytes) {
		return { reason: "size" };
	}
	const contentType = declaredMatchesBytes(input.declaredType, input.bytes);
	if (!contentType) return { reason: "type" };
	const sha256 = createHash("sha256").update(input.bytes).digest("hex");
	if (sha256 !== input.claimedSha256.trim().toLowerCase()) {
		return { reason: "hash" };
	}
	return { contentType, sha256, size: input.bytes.byteLength };
}

export function isAccepted(
	result: AcceptedUpload | RejectedUpload,
): result is AcceptedUpload {
	return "sha256" in result;
}
