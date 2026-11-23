export type MaskRect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

const SMALLEST = 12;

/** A drag that is large enough to cover a name or an id. A tap is ignored. */
export function maskRect(
	start: { x: number; y: number },
	end: { x: number; y: number },
	bounds: { width: number; height: number },
): MaskRect | null {
	const left = Math.max(0, Math.min(start.x, end.x));
	const top = Math.max(0, Math.min(start.y, end.y));
	const right = Math.min(bounds.width, Math.max(start.x, end.x));
	const bottom = Math.min(bounds.height, Math.max(start.y, end.y));
	const width = right - left;
	const height = bottom - top;
	if (width < SMALLEST || height < SMALLEST) return null;
	return { x: left, y: top, width, height };
}

/** Map a cover drawn on the preview onto the photo that will be uploaded. */
export function scaleRect(
	rect: MaskRect,
	from: { width: number; height: number },
	to: { width: number; height: number },
): MaskRect {
	const scaleX = to.width / from.width;
	const scaleY = to.height / from.height;
	return {
		x: rect.x * scaleX,
		y: rect.y * scaleY,
		width: rect.width * scaleX,
		height: rect.height * scaleY,
	};
}

/** The ink already on the page, so the cover is not a new color. */
export function coverColor(): string {
	const ink = getComputedStyle(document.documentElement)
		.getPropertyValue("--ink")
		.trim();
	return ink.length > 0 ? ink : "canvastext";
}
