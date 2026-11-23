const COMPRESS_TARGET_BYTES = 400 * 1024;
const DOOR_BYTES = 10 * 1024 * 1024;

export type PreparedEvidence = {
	bytes: Blob;
	contentType: string;
	sha256: string;
};

export type PrepareResult = PreparedEvidence | "too_large" | "type";

function allowed(type: string): boolean {
	switch (type) {
		case "image/jpeg":
		case "image/png":
		case "image/webp":
		case "application/pdf":
			return true;
		default:
			return false;
	}
}

async function sha256Hex(bytes: Blob): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		await bytes.arrayBuffer(),
	);
	return [...new Uint8Array(digest)]
		.map((part) => part.toString(16).padStart(2, "0"))
		.join("");
}

async function canvasBlob(
	bitmap: ImageBitmap,
	width: number,
	height: number,
	quality: number,
): Promise<Blob | null> {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) return null;
	context.drawImage(bitmap, 0, 0, width, height);
	return new Promise((resolve) => {
		canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
	});
}

/** Shrink a photo until it is under 400 KB. A failure refuses the upload. */
async function compressImage(file: Blob): Promise<Blob | null> {
	const bitmap = await createImageBitmap(file);
	let scale = 1;
	let quality = 0.82;
	try {
		for (let attempt = 0; attempt < 8; attempt += 1) {
			const width = Math.max(1, Math.round(bitmap.width * scale));
			const height = Math.max(1, Math.round(bitmap.height * scale));
			const blob = await canvasBlob(bitmap, width, height, quality);
			if (blob && blob.size > 0 && blob.size <= COMPRESS_TARGET_BYTES)
				return blob;
			if (quality > 0.5) quality -= 0.12;
			else scale *= 0.75;
			if (width < 64 || height < 64) break;
		}
		return null;
	} finally {
		bitmap.close();
	}
}

/**
 * Keep a small allowed file as-is. Compress a large image to JPEG.
 * A PDF is never re-encoded.
 */
export async function prepareEvidenceFile(file: File): Promise<PrepareResult> {
	if (file.size < 1) return "too_large";
	if (file.type === "application/pdf") {
		if (file.size > DOOR_BYTES) return "too_large";
		return {
			bytes: file,
			contentType: file.type,
			sha256: await sha256Hex(file),
		};
	}
	if (!file.type.startsWith("image/")) return "type";
	if (allowed(file.type) && file.size <= COMPRESS_TARGET_BYTES) {
		return {
			bytes: file,
			contentType: file.type,
			sha256: await sha256Hex(file),
		};
	}
	const compressed = await compressImage(file);
	if (!compressed || compressed.size > COMPRESS_TARGET_BYTES)
		return "too_large";
	return {
		bytes: compressed,
		contentType: "image/jpeg",
		sha256: await sha256Hex(compressed),
	};
}
