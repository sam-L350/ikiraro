import { expect, test } from "bun:test";
import { assessPhoto } from "./quality";

function fill(value: number, width: number, height: number): Uint8Array {
	return new Uint8Array(width * height).fill(value);
}

test("a flat dark photo is dark and blurry", () => {
	expect(assessPhoto(fill(20, 4, 4), 4)).toBe("both");
});

test("a flat bright photo is blurry", () => {
	expect(assessPhoto(fill(180, 4, 4), 4)).toBe("blurry");
});

test("a sharp photo is fine", () => {
	const pixels = new Uint8Array(16);
	for (let index = 0; index < pixels.length; index += 1) {
		pixels[index] = (index + Math.floor(index / 4)) % 2 === 0 ? 0 : 255;
	}
	expect(assessPhoto(pixels, 4)).toBe("ok");
});

test("a dark photo with edges is only dark", () => {
	const pixels = new Uint8Array(16);
	for (let y = 0; y < 4; y += 1) {
		for (let x = 0; x < 4; x += 1) {
			pixels[y * 4 + x] = (x + y) % 2 === 0 ? 10 : 20;
		}
	}
	expect(assessPhoto(pixels, 4)).toBe("dark");
});
