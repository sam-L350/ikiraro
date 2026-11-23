export type PhotoWarning = "ok" | "dark" | "blurry" | "both";

/** Mean luminance below this, on a 0–255 scale, is too dark to read. */
const DARK_MEAN = 50;

/** Mean difference between neighboring pixels below this is too soft to read. */
const BLUR_EDGE = 6;

/**
 * A small warning before a photo is sent. It does not block the learner.
 * `luminance` is row-major, one byte per pixel, and `width` is the row length.
 */
export function assessPhoto(
	luminance: ArrayLike<number>,
	width: number,
): PhotoWarning {
	if (width < 2) return "ok";
	const height = Math.floor(luminance.length / width);
	const count = width * height;
	if (height < 2 || count < 4) return "ok";
	let sum = 0;
	for (let index = 0; index < count; index += 1) {
		sum += luminance[index] ?? 0;
	}
	let edge = 0;
	let edges = 0;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width - 1; x += 1) {
			const left = luminance[y * width + x] ?? 0;
			const right = luminance[y * width + x + 1] ?? 0;
			edge += Math.abs(left - right);
			edges += 1;
		}
	}
	for (let y = 0; y < height - 1; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const above = luminance[y * width + x] ?? 0;
			const below = luminance[(y + 1) * width + x] ?? 0;
			edge += Math.abs(above - below);
			edges += 1;
		}
	}
	const dark = sum / count < DARK_MEAN;
	const blurry = edges > 0 && edge / edges < BLUR_EDGE;
	if (dark && blurry) return "both";
	if (dark) return "dark";
	if (blurry) return "blurry";
	return "ok";
}

/** Sample a photo down to a small grid and warn when it is dark or blurry. */
export async function readPhotoWarning(blob: Blob): Promise<PhotoWarning> {
	if (!blob.type.startsWith("image/")) return "ok";
	const bitmap = await createImageBitmap(blob);
	const width = 64;
	const height = Math.max(
		1,
		Math.round((bitmap.height / bitmap.width) * width),
	);
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d", { willReadFrequently: true });
	if (!context) {
		bitmap.close();
		return "ok";
	}
	context.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();
	const pixels = context.getImageData(0, 0, width, height).data;
	const luminance = new Uint8Array(width * height);
	for (let index = 0; index < luminance.length; index += 1) {
		const offset = index * 4;
		const red = pixels[offset] ?? 0;
		const green = pixels[offset + 1] ?? 0;
		const blue = pixels[offset + 2] ?? 0;
		luminance[index] = Math.round(
			0.2126 * red + 0.7152 * green + 0.0722 * blue,
		);
	}
	return assessPhoto(luminance, width);
}
