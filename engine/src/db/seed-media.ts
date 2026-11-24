import { deflateSync } from "node:zlib";

type Rgb = [number, number, number];

const PAPER: Rgb = [244, 240, 236];
const INK: Rgb = [37, 33, 34];
const YELLOW: Rgb = [241, 224, 68];
const GREEN: Rgb = [58, 122, 74];
const SOIL: Rgb = [122, 86, 54];
const WHITE: Rgb = [255, 252, 248];

export type PictureScene = "shop" | "garden" | "phone" | "notebook" | "bicycle";

type Canvas = {
	width: number;
	height: number;
	pixels: Uint8Array;
};

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c;
	}
	return table;
}

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const byte of bytes) {
		const index = (c ^ byte) & 0xff;
		const next = CRC_TABLE[index] ?? 0;
		c = next ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
	const size = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(size);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function u32(value: number): Uint8Array {
	const bytes = new Uint8Array(4);
	new DataView(bytes.buffer).setUint32(0, value);
	return bytes;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const name = new TextEncoder().encode(type);
	const body = concat([name, data]);
	return concat([u32(data.length), body, u32(crc32(body))]);
}

function blank(width: number, height: number): Canvas {
	const pixels = new Uint8Array(width * height * 3);
	for (let index = 0; index < pixels.length; index += 3) {
		pixels[index] = PAPER[0];
		pixels[index + 1] = PAPER[1];
		pixels[index + 2] = PAPER[2];
	}
	return { width, height, pixels };
}

function paint(image: Canvas, x: number, y: number, color: Rgb): void {
	if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
	const index = (y * image.width + x) * 3;
	image.pixels[index] = color[0];
	image.pixels[index + 1] = color[1];
	image.pixels[index + 2] = color[2];
}

function fill(
	image: Canvas,
	x: number,
	y: number,
	width: number,
	height: number,
	color: Rgb,
): void {
	for (let row = y; row < y + height; row++) {
		for (let column = x; column < x + width; column++) {
			paint(image, column, row, color);
		}
	}
}

function disc(
	image: Canvas,
	cx: number,
	cy: number,
	radius: number,
	color: Rgb,
): void {
	const reach = radius * radius;
	for (let y = cy - radius; y <= cy + radius; y++) {
		for (let x = cx - radius; x <= cx + radius; x++) {
			const dx = x - cx;
			const dy = y - cy;
			if (dx * dx + dy * dy <= reach) paint(image, x, y, color);
		}
	}
}

function ring(
	image: Canvas,
	cx: number,
	cy: number,
	radius: number,
	thickness: number,
	color: Rgb,
): void {
	const outer = radius * radius;
	const inner = (radius - thickness) * (radius - thickness);
	for (let y = cy - radius; y <= cy + radius; y++) {
		for (let x = cx - radius; x <= cx + radius; x++) {
			const dx = x - cx;
			const dy = y - cy;
			const distance = dx * dx + dy * dy;
			if (distance <= outer && distance >= inner) paint(image, x, y, color);
		}
	}
}

function encode(image: Canvas): Uint8Array {
	const stride = image.width * 3 + 1;
	const raw = new Uint8Array(stride * image.height);
	for (let y = 0; y < image.height; y++) {
		const row = y * stride;
		raw[row] = 0;
		raw.set(
			image.pixels.subarray(y * image.width * 3, (y + 1) * image.width * 3),
			row + 1,
		);
	}
	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, image.width);
	view.setUint32(4, image.height);
	header[8] = 8;
	header[9] = 2;
	const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
	return concat([
		signature,
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", new Uint8Array()),
	]);
}

function drawShop(image: Canvas, shift: number): void {
	fill(image, 36, 64, 408, 40, YELLOW);
	fill(image, 36, 104, 408, 8, INK);
	fill(image, 70, 210 + shift, 340, 24, INK);
	disc(image, 140, 176, 28, WHITE);
	disc(image, 240, 168, 34, YELLOW);
	disc(image, 340, 180, 26, GREEN);
}

function drawGarden(image: Canvas, shift: number): void {
	fill(image, 0, 220, 480, 100, SOIL);
	for (const x of [120, 240, 360]) {
		fill(image, x - 6, 150 - shift, 12, 80, GREEN);
		disc(image, x, 140 - shift, 28, GREEN);
	}
	disc(image, 400, 48, 22, YELLOW);
}

function drawPhone(image: Canvas, shift: number): void {
	fill(image, 150, 48, 180, 230, INK);
	fill(image, 166, 72 + shift, 148, 160, YELLOW);
	disc(image, 240, 252, 10, PAPER);
}

function drawNotebook(image: Canvas, shift: number): void {
	fill(image, 70, 40, 340, 240, WHITE);
	fill(image, 70, 40, 28, 240, YELLOW);
	for (let line = 0; line < 7; line++) {
		fill(image, 116, 72 + line * 26 + shift, 260, 3, INK);
	}
}

function drawBicycle(image: Canvas, shift: number): void {
	ring(image, 140, 210, 58, 8, INK);
	ring(image, 340, 210, 58, 8, INK);
	fill(image, 140, 200 - shift, 200, 8, INK);
	fill(image, 220, 110, 8, 100, INK);
	disc(image, 224, 100, 14, YELLOW);
}

/** An original illustration for one lesson. No third-party artwork. */
export function lessonPicture(scene: PictureScene, shift: number): Uint8Array {
	const image = blank(480, 320);
	fill(image, 0, 0, 480, 16, YELLOW);
	const nudge = (shift % 4) * 4;
	switch (scene) {
		case "shop":
			drawShop(image, nudge);
			break;
		case "garden":
			drawGarden(image, nudge);
			break;
		case "phone":
			drawPhone(image, nudge);
			break;
		case "notebook":
			drawNotebook(image, nudge);
			break;
		case "bicycle":
			drawBicycle(image, nudge);
			break;
		default: {
			const unreachable: never = scene;
			return unreachable;
		}
	}
	return encode(image);
}

function pdfEscape(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll("(", "\\(")
		.replaceAll(")", "\\)");
}

/** A one-page job aid. Helvetica only, so the text stays in Latin script. */
export function lessonPdf(lines: readonly string[]): Uint8Array {
	const commands = lines
		.map(
			(line, index) =>
				`BT /F1 14 Tf 48 ${740 - index * 24} Td (${pdfEscape(line)}) Tj ET`,
		)
		.join("\n");
	const objects = [
		"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
		"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
		"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
		`4 0 obj << /Length ${commands.length} >> stream\n${commands}\nendstream\nendobj\n`,
		"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
	];
	let body = "%PDF-1.4\n";
	const offsets = [0];
	for (const object of objects) {
		offsets.push(body.length);
		body += object;
	}
	const start = body.length;
	body += "xref\n0 6\n0000000000 65535 f \n";
	for (let index = 1; index <= 5; index++) {
		body += `${String(offsets[index] ?? 0).padStart(10, "0")} 00000 n \n`;
	}
	body += `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
	return new TextEncoder().encode(body);
}
