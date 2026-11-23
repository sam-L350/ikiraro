import { describe, expect, test } from "bun:test";
import { maskRect, scaleRect } from "./mask";

describe("photo covers", () => {
	test("a small tap is ignored and a drag stays inside the photo", () => {
		const bounds = { width: 200, height: 100 };
		expect(maskRect({ x: 10, y: 10 }, { x: 16, y: 40 }, bounds)).toBeNull();
		expect(maskRect({ x: -20, y: 10 }, { x: 40, y: 50 }, bounds)).toEqual({
			x: 0,
			y: 10,
			width: 40,
			height: 40,
		});
		expect(
			scaleRect(
				{ x: 10, y: 20, width: 30, height: 40 },
				{ width: 100, height: 200 },
				{ width: 50, height: 100 },
			),
		).toEqual({ x: 5, y: 10, width: 15, height: 20 });
	});
});
