/** Door limit when configuration has no usable value. */
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/** A typical photo should be under this size before it leaves the device. */
export const COMPRESS_TARGET_BYTES = 400 * 1024;

export const UPLOAD_URL_SECONDS = 10 * 60;
export const EVIDENCE_URL_SECONDS = 5 * 60;

export const MEDIA_MAX_KEY = "media.max_bytes";

const ALLOWED = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
] as const;

export type MediaContentType = (typeof ALLOWED)[number];

export function mediaContentType(value: string): MediaContentType | null {
	switch (value) {
		case "image/jpeg":
		case "image/png":
		case "image/webp":
		case "application/pdf":
			return value;
		default:
			return null;
	}
}

/** A configured limit wins when it is a real byte count. Otherwise the door is 10 MB. */
export function pickMaxBytes(value: unknown): number {
	if (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 1024 &&
		value <= 20 * 1024 * 1024
	) {
		return value;
	}
	return DEFAULT_MAX_BYTES;
}
